import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_user_gift_profile',
  description:
    'get total value of a Telegram user gift profile in TON — portfolio valuation and collection breakdown. Requires @username',
  example: { username: 'durov' },
})
export class GiftUserProfileSkill implements SkillHandler {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('giftassetApiKey')!;
    this.baseUrl = this.config.get<string>('giftassetApiUrl')!;
  }

  async execute(input: any): Promise<any> {
    const username: string = (input.username || input.user || '')
      .replace(/^@/, '')
      .trim();
    if (!username) return { error: 'Missing username' };

    const headers = { 'x-api-token': this.apiKey };
    const limit = Math.min(input.limit || 100, 100);

    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/gifts/get_user_profile_price`, {
        headers,
        params: { username, limit },
        timeout: 15000,
      }),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'User not found' };
    }

    return data;
  }
}
