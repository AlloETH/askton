import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_gifts_aggregator',
  description:
    'search and filter Telegram gifts across all marketplaces — filter by name, price range, rarity, provider (getgems/mrkt/portals/tonnel)',
  example: {
    gift_name: 'Homemade Cake',
    min_price: 1,
    max_price: 100,
    provider: 'getgems',
  },
})
export class GiftAggregatorSkill implements SkillHandler {
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
    if (input.min_price !== undefined) body.min_price = input.min_price;
    if (input.max_price !== undefined) body.max_price = input.max_price;
    if (input.provider) body.provider = input.provider;
    if (input.sort_by) body.sort_by = input.sort_by;
    if (input.limit) body.limit = Math.min(input.limit, 50);

    const { data } = await firstValueFrom(
      this.http.post(`${this.baseUrl}/api/aggregator`, body, {
        headers,
        timeout: 15000,
      }),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch aggregator data' };
    }

    return data;
  }
}
