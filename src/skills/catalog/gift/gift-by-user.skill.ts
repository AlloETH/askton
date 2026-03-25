import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_gifts_by_user',
  description:
    'list all Telegram gifts owned by a user (by Telegram user ID or username) — shows each gift with value and rarity',
  example: { user_id: '123456789' },
})
export class GiftByUserSkill implements SkillHandler {
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
        `${this.baseUrl}/api/v1/gifts/get_gift_by_user`,
        { headers, params: { user_id: userId }, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'User not found or no gifts' };
    }

    return data;
  }
}
