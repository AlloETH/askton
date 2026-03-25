import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_unique_gift_prices',
  description:
    'get pricing for unique/rare gift variants within a specific collection',
  example: { collection: 'Homemade Cake' },
})
export class GiftUniquePricesSkill implements SkillHandler {
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

    const params: any = {};
    if (input.collection) params.collection = input.collection;

    const { data } = await firstValueFrom(
      this.http.get(
        `${this.baseUrl}/api/v1/gifts/get_unique_gifts_price_list`,
        { headers, params, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch unique prices' };
    }

    return data;
  }
}
