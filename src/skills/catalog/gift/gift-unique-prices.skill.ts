import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_unique_gift_prices',
  description:
    'get floor prices for a specific gift collection across all marketplaces. Requires exact collection name (e.g. "Plush Pepe")',
  example: { collection_name: 'Plush Pepe' },
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
    const collectionName: string = input.collection_name || input.collection;
    if (!collectionName) return { error: 'Missing collection_name' };

    const headers = { 'x-api-token': this.apiKey };

    const { data } = await firstValueFrom(
      this.http.get(
        `${this.baseUrl}/api/v1/gifts/get_unique_gifts_price_list`,
        {
          headers,
          params: { collection_name: collectionName },
          timeout: 15000,
        },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Collection not found' };
    }

    return data;
  }
}
