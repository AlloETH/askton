import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_gift_upgrade_stats',
  description:
    'get daily upgrade statistics for Telegram gifts — how many gifts were upgraded, by collection',
  example: {},
})
export class GiftUpgradeStatsSkill implements SkillHandler {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('giftassetApiKey')!;
    this.baseUrl = this.config.get<string>('giftassetApiUrl')!;
  }

  async execute(): Promise<any> {
    const headers = { 'x-api-token': this.apiKey };

    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/gifts/get_gifts_update_stat`, {
        headers,
        timeout: 15000,
      }),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch upgrade stats' };
    }

    return data;
  }
}
