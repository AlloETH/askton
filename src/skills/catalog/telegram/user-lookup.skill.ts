import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';
import { MtprotoService } from '../../../telegram/mtproto.service';

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
    private mtproto: MtprotoService,
  ) {
    this.token = this.config.get<string>('telegramToken')!;
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const user: string = input.user || input.user_id || input.username;
    if (!user) return { error: 'Missing user ID or @username' };

    const isUsername = typeof user === 'string' && user.startsWith('@');

    // Try MTProto first (can resolve any username)
    if (isUsername && this.mtproto.isReady()) {
      const result = await this.mtproto.getUserFullInfo(user);
      if (result) {
        // Also try to get TON wallet via DNS
        const tonWallet = await this.resolveViaTonDns(user.replace(/^@/, ''));
        if (tonWallet) result.tonWalletAddress = tonWallet;
        return result;
      }
    }

    // Fall back to Bot API
    const chatId = isUsername ? user : Number(user);

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
      // getChat failed
    }

    // Last resort: try TON DNS
    if (isUsername) {
      const username = user.replace(/^@/, '');
      const tonWallet = await this.resolveViaTonDns(username);
      if (tonWallet) {
        return {
          username,
          note: 'Full Telegram profile unavailable. TON wallet found via DNS.',
          tonWalletAddress: tonWallet,
        };
      }
    }

    return {
      error:
        'User not found. MTProto may not be configured, and the bot has not seen this user.',
    };
  }

  private async resolveViaTonDns(username: string): Promise<string | null> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    for (const suffix of ['.ton', '.t.me']) {
      try {
        const { data } = await firstValueFrom(
          this.http.get(
            `https://tonapi.io/v2/dns/${username}${suffix}/resolve`,
            { headers, timeout: 10000 },
          ),
        );
        if (data.wallet?.address) return data.wallet.address as string;
      } catch {
        // not found or no wallet record
      }
    }

    return null;
  }
}
