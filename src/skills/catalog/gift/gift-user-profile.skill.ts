import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_user_gift_profile',
  description:
    'get total value of a Telegram user gift profile in TON — portfolio valuation, top gifts, and collection breakdown',
  example: { user_id: '123456789' },
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
    const userId: string = input.user_id || input.username;
    if (!userId) return { error: 'Missing user_id or username' };

    const headers = { 'x-api-token': this.apiKey };

    const { data } = await firstValueFrom(
      this.http.get(
        `${this.baseUrl}/api/v1/gifts/get_user_profile_price`,
        { headers, params: { user_id: userId }, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'User not found' };
    }

    return data;
  }
}
