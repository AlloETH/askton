import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_channel_info',
  description:
    'get detailed Telegram channel or group stats — member count, description, type, linked discussion group',
  example: { channel: '@tabordigital' },
})
export class ChannelStatsSkill implements SkillHandler {
  private token: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.token = this.config.get<string>('telegramToken')!;
  }

  async execute(input: any): Promise<any> {
    const channel: string =
      input.channel || input.chat || input.username || input.chat_id;
    if (!channel) return { error: 'Missing channel @username or ID' };

    const chatId = channel.startsWith('@') ? channel : Number(channel);

    const { data } = await firstValueFrom(
      this.http.get(`https://api.telegram.org/bot${this.token}/getChat`, {
        params: { chat_id: chatId },
        timeout: 10000,
      }),
    );

    if (!data?.ok) {
      return { error: data?.description || 'Channel not found' };
    }

    const c = data.result;

    if (c.type !== 'channel' && c.type !== 'supergroup') {
      return { error: `This is a ${c.type}, not a channel or group` };
    }

    let memberCount: number | null = null;
    try {
      const { data: countData } = await firstValueFrom(
        this.http.get(
          `https://api.telegram.org/bot${this.token}/getChatMemberCount`,
          { params: { chat_id: chatId }, timeout: 5000 },
        ),
      );
      memberCount = countData?.result ?? null;
    } catch {
      // may fail if bot isn't a member
    }

    // Try to get admins
    let adminCount: number | null = null;
    try {
      const { data: adminData } = await firstValueFrom(
        this.http.get(
          `https://api.telegram.org/bot${this.token}/getChatAdministrators`,
          { params: { chat_id: chatId }, timeout: 5000 },
        ),
      );
      adminCount = adminData?.result?.length ?? null;
    } catch {
      // may fail if bot isn't a member
    }

    return {
      id: c.id,
      type: c.type,
      title: c.title || null,
      username: c.username || null,
      description: c.description || null,
      memberCount,
      adminCount,
      inviteLink: c.invite_link || null,
      isForum: c.is_forum || false,
      linkedChatId: c.linked_chat_id || null,
      hasProtectedContent: c.has_protected_content || false,
      hasVisibleHistory: c.has_visible_history ?? null,
    };
  }
}
