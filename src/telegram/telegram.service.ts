import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context } from 'telegraf';
import { Message, Update, InlineQueryResult } from 'telegraf/types';
import { AgentService } from '../agent/agent.service.js';
import { createHash } from 'crypto';

type TextMessage = Update.New & Update.NonChannel & Message.TextMessage;

interface Entity {
  type: string;
  offset: number;
  length: number;
}

const STREAM_EDIT_INTERVAL_MS = 1500;
/** Telegram inline queries expire after ~15s; answer before that */
const INLINE_TIMEOUT_MS = 12_000;

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

  async handleInlineQuery(ctx: Context) {
    const query = ctx.inlineQuery?.query?.trim();

    if (!query) {
      await ctx.answerInlineQuery([], { cache_time: 0 });
      return;
    }

    this.logger.log(`Inline query: "${query}" from ${ctx.inlineQuery!.from.first_name}`);

    try {
      const username = ctx.inlineQuery!.from.first_name || 'someone';

      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), INLINE_TIMEOUT_MS),
      );
      const result = await Promise.race([
        this.agentService.run(query, 'inline', username),
        timeout,
      ]);

      const reply = result ?? "This query takes a bit longer — try asking me in a direct message.";

      const resultId = createHash('md5').update(query + Date.now()).digest('hex').slice(0, 32);

      const results: InlineQueryResult[] = [
        {
          type: 'article',
          id: resultId,
          title: query.length > 64 ? query.slice(0, 61) + '...' : query,
          description: reply.length > 100 ? reply.slice(0, 97) + '...' : reply,
          input_message_content: {
            message_text: reply,
            parse_mode: 'Markdown',
          },
        },
      ];

      await ctx.answerInlineQuery(results, { cache_time: result ? 30 : 5 });
    } catch (err) {
      this.logger.error('Error handling inline query', err);
      await ctx.answerInlineQuery([], { cache_time: 5 }).catch(() => {});
    }
  }

  async handleMessage(ctx: Context) {
    const msg = ctx.message as TextMessage | undefined;
    if (!msg?.text) return;
    if (msg.from?.is_bot) return;

    this.logger.log(
      `Received text: "${msg.text}" in chat ${msg.chat.type} (${msg.chat.id})`,
    );
    this.logger.log(`Entities: ${JSON.stringify(msg.entities || [])}`);

    // Support both group and private chats
    const isPrivate = msg.chat.type === 'private';

    if (!isPrivate) {
      // In groups, respond to @mentions OR replies to the bot's messages
      const replyMsg = msg.reply_to_message as TextMessage | undefined;
      const isReplyToBot =
        replyMsg?.from?.username?.toLowerCase() ===
        this.botUsername.toLowerCase();

      const entities = (msg.entities || []) as Entity[];
      const mentions = entities
        .filter((e) => e.type === 'mention')
        .map((e) => msg.text.slice(e.offset, e.offset + e.length));

      const mentioned = mentions.some(
        (m: string) => m.toLowerCase() === `@${this.botUsername.toLowerCase()}`,
      );

      if (!mentioned && !isReplyToBot) return;
    }

    // Extract query (remove mention)
    let query: string = msg.text;
    const mentionPattern = new RegExp(`@${this.botUsername}`, 'gi');
    query = query.replace(mentionPattern, '').trim();

    if (!query) {
      await ctx.reply(
        'Yes? Ask me something — prices, wallets, NFT info, usernames.',
      );
      return;
    }

    const groupId = String(msg.chat.id);
    const username = msg.from?.first_name || 'someone';

    try {
      await ctx.telegram.sendChatAction(msg.chat.id, 'typing');

      // Send placeholder message for streaming edits
      const placeholder = await ctx.reply('...', {
        reply_parameters: { message_id: msg.message_id },
      });

      let lastEditText = '';
      let lastEditTime = 0;
      let editPending = false;

      const scheduleEdit = (text: string) => {
        const now = Date.now();
        if (now - lastEditTime < STREAM_EDIT_INTERVAL_MS) {
          editPending = true;
          return;
        }
        editPending = false;
        lastEditText = text;
        lastEditTime = now;
        ctx.telegram
          .editMessageText(msg.chat.id, placeholder.message_id, undefined, text)
          .catch(() => {
            // Ignore edit errors (e.g. message not modified)
          });
      };

      const reply = await this.agentService.run(
        query,
        groupId,
        username,
        scheduleEdit,
      );

      // Final edit with complete text + Markdown
      if (reply !== lastEditText || editPending) {
        try {
          await ctx.telegram.editMessageText(
            msg.chat.id,
            placeholder.message_id,
            undefined,
            reply,
            { parse_mode: 'Markdown' },
          );
        } catch {
          // Fall back to plain text if Markdown fails
          await ctx.telegram
            .editMessageText(
              msg.chat.id,
              placeholder.message_id,
              undefined,
              reply,
            )
            .catch(() => {});
        }
      }
    } catch (err) {
      this.logger.error('Error handling message', err);
      await ctx.reply(
        "Sorry, I couldn't get that data. Try again in a moment.",
        {
          reply_parameters: { message_id: msg.message_id },
        },
      );
    }
  }
}
