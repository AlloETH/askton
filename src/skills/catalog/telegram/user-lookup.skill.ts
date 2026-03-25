import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'lookup_telegram_user',
  description:
    'look up a Telegram user or bot by numeric ID or @username — shows name, bio, photo, premium status, and linked info',
  example: { user: '@durov' },
})
export class UserLookupSkill implements SkillHandler {
  private token: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.token = this.config.get<string>('telegramToken')!;
  }

  async execute(input: any): Promise<any> {
    const user: string = input.user || input.user_id || input.username;
    if (!user) return { error: 'Missing user ID or @username' };

    const chatId = user.startsWith('@') ? user : Number(user);

    const { data } = await firstValueFrom(
      this.http.get(`https://api.telegram.org/bot${this.token}/getChat`, {
        params: { chat_id: chatId },
        timeout: 10000,
      }),
    );

    if (!data?.ok) {
      return { error: data?.description || 'User not found' };
    }

    const chat = data.result;

    // Try to get profile photos count
    let photoCount: number | null = null;
    try {
      const { data: photoData } = await firstValueFrom(
        this.http.get(
          `https://api.telegram.org/bot${this.token}/getUserProfilePhotos`,
          { params: { user_id: chat.id, limit: 1 }, timeout: 5000 },
        ),
      );
      photoCount = photoData?.result?.total_count ?? null;
    } catch {
      // not available for all users
    }

    return {
      id: chat.id,
      type: chat.type,
      firstName: chat.first_name || null,
      lastName: chat.last_name || null,
      username: chat.username || null,
      bio: chat.bio || null,
      isPremium: chat.has_premium || false,
      hasCustomEmoji: chat.has_custom_emoji || false,
      profilePhotoCount: photoCount,
      accentColorId: chat.accent_color_id ?? null,
      emojiStatusCustomEmojiId: chat.emoji_status_custom_emoji_id || null,
    };
  }
}
