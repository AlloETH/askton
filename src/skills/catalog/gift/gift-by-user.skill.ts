import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { MtprotoService } from '../../../telegram/mtproto.service.js';

@Skill({
  name: 'get_gifts_by_user',
  description:
    'list all Telegram gifts owned by a user (by Telegram @username) — shows each gift with value and rarity',
  example: { username: 'durov' },
})
export class GiftByUserSkill implements SkillHandler {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
    private mtproto: MtprotoService,
  ) {
    this.apiKey = this.config.get<string>('giftassetApiKey')!;
    this.baseUrl = this.config.get<string>('giftassetApiUrl')!;
  }

  async execute(input: any): Promise<any> {
    const username: string = (input.username || input.user || '')
      .replace(/^@/, '')
      .trim();
    if (!username) return { error: 'Missing username' };

    const limit = Math.min(input.limit || 50, 100);

    // Try MTProto first
    if (this.mtproto.isReady()) {
      const result = await this.mtproto.getUserStarGifts(username, limit);
      if (result) return result;
    }

    // Fall back to giftasset API
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.baseUrl}/api/v1/gifts/get_gift_by_user`, {
          headers: { 'x-api-token': this.apiKey },
          params: { username, limit },
          timeout: 15000,
        }),
      );

      if (!data || data.status === 'error') {
        return { error: data?.message || 'User not found or no gifts' };
      }

      return data;
    } catch (err: any) {
      const detail = err?.response?.data?.message || err?.message || String(err);
      return { error: `Failed to fetch gifts for @${username}`, detail };
    }
  }
}
