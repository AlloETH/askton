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
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.token = this.config.get<string>('telegramToken')!;
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const user: string = input.user || input.user_id || input.username;
    if (!user) return { error: 'Missing user ID or @username' };

    const chatId = user.startsWith('@') ? user : Number(user);

    // Try Telegram Bot API first
    try {
      const { data } = await firstValueFrom(
        this.http.get(`https://api.telegram.org/bot${this.token}/getChat`, {
          params: { chat_id: chatId },
          timeout: 10000,
        }),
      );

      if (data?.ok) {
        const chat = data.result;

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
    } catch {
      // getChat failed — user hasn't interacted with bot
    }

    // Fallback: try resolving via TON DNS to get at least wallet info
    if (typeof chatId === 'string') {
      const username = chatId.replace(/^@/, '');
      const tonWallet = await this.resolveViaTonDns(username);
      if (tonWallet) {
        return {
          username,
          note: 'User has not interacted with the bot, so full Telegram profile is unavailable. TON wallet found via DNS.',
          tonWalletAddress: tonWallet,
        };
      }
    }

    return {
      error:
        'User not found. The bot can only look up users who have interacted with it, or who have a .ton/.t.me domain.',
    };
  }

  private async resolveViaTonDns(username: string): Promise<string | null> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    for (const suffix of ['.ton', '.t.me']) {
      try {
        const { data } = await firstValueFrom(
          this.http.get(`https://tonapi.io/v2/dns/${username}${suffix}`, {
            headers,
            timeout: 10000,
          }),
        );
        if (data.wallet?.address) return data.wallet.address as string;
        if (data.item?.owner?.address) return data.item.owner.address as string;
      } catch {
        // not found
      }
    }

    return null;
  }
}
