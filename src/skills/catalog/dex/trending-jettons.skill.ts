import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_trending_jettons',
  description:
    'get trending/popular jettons (tokens) on STON.fi ranked by popularity — see what tokens are hot right now',
  example: { limit: 10 },
})
export class TrendingJettonsSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const limit = Math.min(Math.max(input.limit || 10, 1), 50);

    const { data } = await firstValueFrom(
      this.http.get('https://api.ston.fi/v1/assets', { timeout: 15000 }),
    );

    const assets: any[] = data.asset_list || [];

    const trending = assets
      .filter(
        (a: any) =>
          !a.blacklisted &&
          !a.deprecated &&
          !a.default_symbol &&
          a.third_party_usd_price &&
          a.popularity_index != null,
      )
      .sort((a: any, b: any) => (b.popularity_index || 0) - (a.popularity_index || 0))
      .slice(0, limit)
      .map((a: any, i: number) => ({
        rank: i + 1,
        symbol: a.symbol,
        name: a.display_name,
        address: a.contract_address,
        priceUsd: a.third_party_usd_price || null,
        popularityIndex: a.popularity_index,
        tags: a.tags || [],
      }));

    return {
      count: trending.length,
      tokens: trending,
    };
  }
}
