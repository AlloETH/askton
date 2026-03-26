import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { MtprotoService } from '../../../telegram/mtproto.service.js';

@Skill({
  name: 'check_chat_member',
  description:
    'check if a user is a member of a Telegram group/channel and their role (admin, member, banned, etc)',
  example: { chat: '@toncoinchat', user: '@durov' },
})
export class ChatMemberSkill implements SkillHandler {
  private token: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
    private mtproto: MtprotoService,
  ) {
    this.token = this.config.get<string>('telegramToken')!;
  }

  async execute(input: any): Promise<any> {
    const chat: string = input.chat || input.chat_id;
    const user: string = input.user || input.user_id;
    if (!chat || !user) {
      return { error: 'Missing chat and user parameters' };
    }

    // Resolve user ID — try MTProto first for @username
    const chatId = chat.startsWith('@') ? chat : Number(chat);
    let resolvedUserId: string | number = user.startsWith('@')
      ? user
      : Number(user);

    if (typeof resolvedUserId === 'string' && this.mtproto.isReady()) {
      const mtUser = await this.mtproto.getUserFullInfo(resolvedUserId);
      if (mtUser?.id) {
        resolvedUserId = Number(mtUser.id);
      }
    }

    // If still a string, try Bot API to resolve
    if (typeof resolvedUserId === 'string') {
      try {
        const { data: userData } = await firstValueFrom(
          this.http.get(`https://api.telegram.org/bot${this.token}/getChat`, {
            params: { chat_id: resolvedUserId },
            timeout: 5000,
          }),
        );
        resolvedUserId = userData?.result?.id;
      } catch {
        return { error: `Could not resolve user ${user}` };
      }
    }

    const { data } = await firstValueFrom(
      this.http.get(`https://api.telegram.org/bot${this.token}/getChatMember`, {
        params: { chat_id: chatId, user_id: resolvedUserId },
        timeout: 10000,
      }),
    );

    if (!data?.ok) {
      return { error: data?.description || 'Could not check membership' };
    }

    const m = data.result;

    return {
      status: m.status,
      user: {
        id: m.user?.id,
        firstName: m.user?.first_name || null,
        lastName: m.user?.last_name || null,
        username: m.user?.username || null,
        isPremium: m.user?.is_premium || false,
      },
      isAnonymous: m.is_anonymous || false,
      customTitle: m.custom_title || null,
      canManageChat: m.can_manage_chat || false,
      canPostMessages: m.can_post_messages || false,
      canDeleteMessages: m.can_delete_messages || false,
      joinedDate: m.until_date
        ? new Date(m.until_date * 1000).toISOString()
        : null,
    };
  }
}
