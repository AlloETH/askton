import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_gift_price_history',
  description:
    'get historical price data for Telegram gifts — optionally filter by collection name for specific history',
  example: { collection_name: 'Plush Pepe' },
})
export class GiftPriceHistorySkill implements SkillHandler {
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

    const params: Record<string, string> = {};
    if (input.collection_name) params.collection_name = input.collection_name;

    const { data } = await firstValueFrom(
      this.http.get(
        `${this.baseUrl}/api/v1/gifts/get_gifts_price_list_history`,
        { headers, params, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch price history' };
    }

    return data;
  }
}
