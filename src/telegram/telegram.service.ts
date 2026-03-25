import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context } from 'telegraf';
import { AgentService } from '../agent/agent.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private botUsername: string;

  constructor(
    private agentService: AgentService,
    private config: ConfigService,
  ) {
    this.botUsername = this.config.get<string>('botUsername')!;
  }

  async handleMessage(ctx: Context) {
    const msg = ctx.message as any;
    if (!msg?.text) return;
    if (msg.from?.is_bot) return;

    this.logger.log(`Received text: "${msg.text}" in chat ${msg.chat.type} (${msg.chat.id})`);
    this.logger.log(`Entities: ${JSON.stringify(msg.entities || [])}`);

    // Support both group and private chats
    const isPrivate = msg.chat.type === 'private';

    if (!isPrivate) {
      // In groups, respond to @mentions OR replies to the bot's messages
      const isReplyToBot =
        msg.reply_to_message?.from?.username?.toLowerCase() === this.botUsername.toLowerCase();

      const entities = msg.entities || [];
      const mentions = entities
        .filter((e: any) => e.type === 'mention')
        .map((e: any) => msg.text.slice(e.offset, e.offset + e.length));

      const mentioned = mentions.some(
        (m: string) => m.toLowerCase() === `@${this.botUsername.toLowerCase()}`,
      );

      if (!mentioned && !isReplyToBot) return;
    }

    // Extract query (remove mention)
    let query = msg.text;
    const mentionPattern = new RegExp(`@${this.botUsername}`, 'gi');
    query = query.replace(mentionPattern, '').trim();

    if (!query) {
      await ctx.reply('Yes? Ask me something — prices, wallets, NFT info, usernames.');
      return;
    }

    const groupId = String(msg.chat.id);
    const username = msg.from?.first_name || 'someone';

    try {
      await ctx.telegram.sendChatAction(msg.chat.id, 'typing');
      const reply = await this.agentService.run(query, groupId, username);
      const replyOpts = { reply_parameters: { message_id: msg.message_id } };

      // Try Markdown first, fall back to plain text if Telegram can't parse it
      try {
        await ctx.reply(reply, { ...replyOpts, parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(reply, replyOpts);
      }
    } catch (err) {
      this.logger.error('Error handling message', err);
      await ctx.reply("Sorry, I couldn't get that data. Try again in a moment.", {
        reply_parameters: { message_id: msg.message_id },
      });
    }
  }
}
