import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_gift_by_name',
  description:
    'search for a Telegram gift by its exact name (e.g. "Homemade Cake") — returns all variants with prices and supply',
  example: { name: 'Homemade Cake' },
})
export class GiftByNameSkill implements SkillHandler {
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
    const name: string = input.name;
    if (!name) return { error: 'Missing gift name' };

    const headers = { 'x-api-token': this.apiKey };

    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/gifts/get_gift_by_name`, {
        headers,
        params: { name },
        timeout: 15000,
      }),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Gift not found' };
    }

    return data;
  }
}
