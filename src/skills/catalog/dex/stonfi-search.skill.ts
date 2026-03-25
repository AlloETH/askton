import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'search_jetton',
  description:
    'search for a jetton (token) by name or symbol on STON.fi — returns contract addresses, prices, and verification status',
  example: { query: 'BOLT' },
})
export class StonfiSearchSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const query: string = (input.query || '').trim();
    const limit = Math.min(Math.max(input.limit || 10, 1), 50);

    if (!query) {
      return { error: 'Missing search query' };
    }

    const { data } = await firstValueFrom(
      this.http.get('https://api.ston.fi/v1/assets', { timeout: 15000 }),
    );

    const assets: any[] = data.asset_list || [];
    const q = query.toLowerCase();

    const scored = assets
      .filter(
        (a: any) =>
          !a.blacklisted &&
          !a.deprecated &&
          !a.default_symbol &&
          (a.symbol?.toLowerCase().includes(q) ||
            a.display_name?.toLowerCase().includes(q)),
      )
      .map((a: any) => {
        let score = 0;
        const sym = (a.symbol || '').toLowerCase();
        const name = (a.display_name || '').toLowerCase();

        if (sym === q) score += 100;
        else if (sym.startsWith(q)) score += 50;
        else if (sym.includes(q)) score += 20;

        if (name === q) score += 80;
        else if (name.startsWith(q)) score += 30;
        else if (name.includes(q)) score += 10;

        if (a.third_party_usd_price) score += 5;

        return { asset: a, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const results = scored.map((s) => ({
      symbol: s.asset.symbol,
      name: s.asset.display_name,
      address: s.asset.contract_address,
      decimals: s.asset.decimals,
      priceUsd: s.asset.third_party_usd_price || null,
      verified: !!s.asset.third_party_usd_price,
      image: s.asset.image_url || null,
    }));

    return {
      query,
      count: results.length,
      results,
    };
  }
}
