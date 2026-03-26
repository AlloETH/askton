import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_gift_by_name',
  description:
    'look up a specific Telegram gift by its full slug name (e.g. "EasterEgg-1") — returns rarity, attributes, and market data',
  example: { name: 'EasterEgg-1' },
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

    // Try the v1 endpoint first
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.baseUrl}/api/v1/gifts/get_gift_by_name`, {
          headers,
          params: { name },
          timeout: 15000,
        }),
      );

      if (data && data.status !== 'error') return data;
    } catch {
      // If 403 (not whitelisted), fall back to POST /api/gifts
    }

    // Fallback: use POST /api/gifts with slug
    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/gifts`,
        { slug: name },
        { headers, timeout: 15000 },
      ),
    );

    if (!data || (!data.title && !data.model && !data.owner)) {
      return { error: `Gift "${name}" not found` };
    }

    return data;
  }
}
