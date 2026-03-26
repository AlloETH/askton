import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_gift_market_actions',
  description:
    'get recent market actions for Telegram gifts — buys, listings, price changes across marketplaces. Filter by gift name or action type',
  example: { gift_name: 'Homemade Cake', action_type: 'buy', limit: 20 },
})
export class GiftMarketActionsSkill implements SkillHandler {
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
    const headers = { 'x-api-token': this.apiKey };

    const body: any = {};
    if (input.gift_name) body.gift_name = input.gift_name;
    if (input.action_type) body.action_type = input.action_type;
    if (input.limit) body.limit = Math.min(input.limit, 50);
    if (input.provider) body.provider = input.provider;

    const { data } = await firstValueFrom(
      this.http.post(`${this.baseUrl}/api/actions/markets`, body, {
        headers,
        timeout: 15000,
      }),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch market actions' };
    }

    return data;
  }
}
