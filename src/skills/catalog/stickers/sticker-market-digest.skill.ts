import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'sticker_market_digest',
  description:
    'Get TON sticker market digest — top movers, gainers, losers, burns, and volume leaders. Supports period: 4h, 24h, 7d.',
  example: { period: '24h' },
})
export class StickerMarketDigestSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const period: string = input.period || '24h';
    const limit: number = input.limit || 10;

    const { data } = await firstValueFrom(
      this.http.get('https://stickers.tools/api/v1/market/digest', {
        params: { period, limit },
        timeout: 10000,
      }),
    );

    if (!data?.success) return { error: data?.error || 'Failed to fetch digest' };

    return data.data;
  }
}
