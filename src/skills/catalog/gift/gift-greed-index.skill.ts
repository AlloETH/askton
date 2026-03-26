import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_gift_greed_index',
  description:
    'get greed index for Telegram gift collections — hidden gifts, upgraded gifts, and ownership concentration metrics',
  example: {},
})
export class GiftGreedIndexSkill implements SkillHandler {
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
      this.http.get(
        `${this.baseUrl}/api/v1/gifts/get_gifts_collections_greed_index`,
        { headers, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch greed index' };
    }

    return data;
  }
}
