import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'sticker_market_stats',
  description:
    'Get overall TON NFT sticker market statistics — supply, trades, volumes, market cap, fees. Supports filtering by issuer (Goodies or Sticker Pack).',
  example: {},
})
export class StickerMarketStatsSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const params: Record<string, any> = {};
    if (input.issuer) params.issuers = input.issuer;

    const { data } = await firstValueFrom(
      this.http.get('https://stickers.tools/api/v1/market/stats', {
        params,
        timeout: 15000,
      }),
    );

    if (!data?.success) return { error: data?.error || 'Failed to fetch market stats' };

    // Return overview without per-sticker breakdown to save tokens
    const stats = data.data;
    const result: Record<string, any> = {
      supply: stats.supply,
      trades: stats.trades,
      total_volume: stats.total_volume,
      mcap: stats.mcap,
      marketplace_fees: stats.marketplace_fees,
      royalties: stats.royalties,
    };

    // Include collection summaries without sticker-level detail
    if (stats.collections) {
      result.collections = Object.entries(stats.collections).map(([id, col]: [string, any]) => ({
        id,
        name: col.name,
        issuer: col.issuer,
        supply: col.supply,
        trades: col.trades,
        total_volume: col.total_volume,
        mcap: col.mcap,
      }));
    }

    return result;
  }
}
