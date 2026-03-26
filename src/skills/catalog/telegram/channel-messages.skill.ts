import { Skill, SkillHandler } from '../../skill.decorator.js';
import { MtprotoService } from '../../../telegram/mtproto.service.js';

@Skill({
  name: 'get_channel_messages',
  description:
    'get recent messages from a public Telegram channel — shows text, views, forwards, replies (requires MTProto)',
  example: { channel: '@durov', limit: 5 },
})
export class ChannelMessagesSkill implements SkillHandler {
  constructor(private mtproto: MtprotoService) {}

  async execute(input: any): Promise<any> {
    const channel: string =
      input.channel || input.chat || input.username || input.chat_id;
    if (!channel) return { error: 'Missing channel @username' };

    if (!this.mtproto.isReady()) {
      return {
        error: 'MTProto not configured — cannot fetch channel messages',
      };
    }

    const limit = Math.min(Math.max(input.limit || 10, 1), 50);
    const messages = await this.mtproto.getChannelMessages(channel, limit);

    if (!messages) {
      return {
        error: 'Could not fetch messages — channel may not exist or is private',
      };
    }

    return {
      channel: channel.replace(/^@/, ''),
      count: messages.length,
      messages,
    };
  }
}
