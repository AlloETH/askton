import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_chat_info',
  description:
    'get info about a Telegram group, supergroup, or channel — member count, description, permissions, linked chat',
  example: { chat: '@toncoinchat' },
})
export class ChatInfoSkill implements SkillHandler {
  private token: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.token = this.config.get<string>('telegramToken')!;
  }

  async execute(input: any): Promise<any> {
    const chat: string = input.chat || input.chat_id || input.username;
    if (!chat) return { error: 'Missing chat ID or @username' };

    const chatId = chat.startsWith('@') ? chat : Number(chat);

    const { data } = await firstValueFrom(
      this.http.get(`https://api.telegram.org/bot${this.token}/getChat`, {
        params: { chat_id: chatId },
        timeout: 10000,
      }),
    );

    if (!data?.ok) {
      return { error: data?.description || 'Chat not found' };
    }

    const c = data.result;

    // Try to get member count
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
      // may fail if bot is not in the chat
    }

    return {
      id: c.id,
      type: c.type,
      title: c.title || null,
      username: c.username || null,
      description: c.description || null,
      memberCount,
      inviteLink: c.invite_link || null,
      hasVisibleHistory: c.has_visible_history ?? null,
      isForum: c.is_forum || false,
      linkedChatId: c.linked_chat_id || null,
      slowModeDelay: c.slow_mode_delay || null,
      hasProtectedContent: c.has_protected_content || false,
      stickerSetName: c.sticker_set_name || null,
    };
  }
}
