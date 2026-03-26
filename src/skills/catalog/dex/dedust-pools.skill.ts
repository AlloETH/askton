import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_dedust_pools',
  description:
    'list top DeDust liquidity pools by TVL, optionally filtered by a jetton address',
  example: { jetton_address: 'EQ...', limit: 10 },
})
export class DedustPoolsSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const jettonAddress: string | undefined = input.jetton_address;
    const limit = Math.min(Math.max(input.limit || 10, 1), 50);

    const { data } = await firstValueFrom(
      this.http.get('https://api.dedust.io/v2/pools', { timeout: 15000 }),
    );

    let pools: any[] = Array.isArray(data) ? data : [];

    // Filter by jetton if provided
    if (jettonAddress) {
      pools = pools.filter((p: any) => {
        const assets = p.assets || [];
        return assets.some(
          (a: any) =>
            a.address === jettonAddress ||
            a.metadata?.address === jettonAddress,
        );
      });
    }

    // Sort by TVL/reserves descending
    pools.sort((a: any, b: any) => {
      const tvlA = parseFloat(a.totalSupply || a.reserves?.[0] || '0');
      const tvlB = parseFloat(b.totalSupply || b.reserves?.[0] || '0');
      return tvlB - tvlA;
    });

    const topPools = pools.slice(0, limit).map((p: any, i: number) => {
      const assets = p.assets || [];
      return {
        rank: i + 1,
        address: p.address,
        type: p.type || 'volatile',
        assets: assets.map((a: any) => ({
          type: a.type,
          address: a.address || null,
          symbol: a.metadata?.symbol || null,
          name: a.metadata?.name || null,
        })),
        reserves: p.reserves || [],
        tradeFee: p.tradeFee || null,
      };
    });

    return {
      totalPools: pools.length,
      showing: topPools.length,
      filter: jettonAddress || 'none',
      pools: topPools,
    };
  }
}
