import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_stonfi_pools',
  description:
    'list top STON.fi liquidity pools by 24h volume, optionally filtered by a jetton address',
  example: { jetton_address: 'EQ...', limit: 10 },
})
export class StonfiPoolsSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const jettonAddress: string | undefined = input.jetton_address;
    const limit = Math.min(Math.max(input.limit || 10, 1), 50);

    const { data } = await firstValueFrom(
      this.http.get('https://api.ston.fi/v1/pools', { timeout: 15000 }),
    );

    let pools: any[] = data.pool_list || [];

    // Filter out deprecated
    pools = pools.filter((p: any) => !p.deprecated);

    // Filter by jetton if provided
    if (jettonAddress) {
      pools = pools.filter(
        (p: any) =>
          p.token0_address === jettonAddress ||
          p.token1_address === jettonAddress,
      );
    }

    // Sort by 24h volume descending
    pools.sort(
      (a: any, b: any) =>
        parseFloat(b.apy_1d || '0') - parseFloat(a.apy_1d || '0'),
    );
    pools.sort(
      (a: any, b: any) =>
        parseFloat(b.collected_token0_protocol_fee || '0') -
        parseFloat(a.collected_token0_protocol_fee || '0'),
    );

    // Take top pools by reserve (TVL proxy)
    pools.sort(
      (a: any, b: any) =>
        parseFloat(b.reserve0 || '0') +
        parseFloat(b.reserve1 || '0') -
        (parseFloat(a.reserve0 || '0') + parseFloat(a.reserve1 || '0')),
    );

    const topPools = pools.slice(0, limit).map((p: any, i: number) => ({
      rank: i + 1,
      address: p.address,
      token0: p.token0_address,
      token1: p.token1_address,
      reserve0: p.reserve0,
      reserve1: p.reserve1,
      apy1d: p.apy_1d || null,
      apy7d: p.apy_7d || null,
      apy30d: p.apy_30d || null,
      lpFee: p.lp_fee || null,
      deprecated: p.deprecated || false,
    }));

    return {
      totalPools: pools.length,
      showing: topPools.length,
      filter: jettonAddress || 'none',
      pools: topPools,
    };
  }
}
