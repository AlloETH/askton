import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_gift_info',
  description:
    'get detailed info about a specific Telegram gift by its slug (e.g. "Homemade Cake-10000") — price, rarity, supply, marketplace listings',
  example: { slug: 'Homemade Cake-10000' },
})
export class GiftInfoSkill implements SkillHandler {
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
    const slug: string = input.slug;
    if (!slug) return { error: 'Missing gift slug' };

    const headers = { 'x-api-token': this.apiKey };

    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/gifts`,
        { slug },
        { headers, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Gift not found' };
    }

    return data;
  }
}
