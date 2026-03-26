import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_gift_emission',
  description:
    'get unique gift issuance/emission data — how many unique gifts have been created per collection',
  example: {},
})
export class GiftEmissionSkill implements SkillHandler {
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
        `${this.baseUrl}/api/v1/gifts/get_gifts_collections_emission`,
        { headers, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch emission data' };
    }

    return data;
  }
}
