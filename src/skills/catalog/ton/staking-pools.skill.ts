import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_staking_pools',
  description:
    'list available TON staking pools with APY, minimum stake, and cycle info — compare validators and liquid staking options',
  example: {},
})
export class StakingPoolsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };
    const limit = Math.min(Math.max(input.limit || 20, 1), 100);

    const { data } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/staking/pools`, { headers }),
    );

    const pools = (data.pools || [])
      .sort((a: any, b: any) => (b.apy || 0) - (a.apy || 0))
      .slice(0, limit)
      .map((p: any, i: number) => ({
        rank: i + 1,
        address: p.address,
        name: p.name || 'Unknown',
        apy: p.apy ? (p.apy * 100).toFixed(2) + '%' : 'N/A',
        apyRaw: p.apy || 0,
        minStake: p.min_stake ? Number(p.min_stake) / 1e9 : null,
        totalStaked: p.total_amount ? Number(p.total_amount) / 1e9 : null,
        stakersCount: p.current_nominators || null,
        maxStakers: p.max_nominators || null,
        cycleStart: p.cycle_start
          ? new Date(p.cycle_start * 1000).toISOString()
          : null,
        cycleEnd: p.cycle_end
          ? new Date(p.cycle_end * 1000).toISOString()
          : null,
        verified: p.verified || false,
        implementation: p.implementation || 'unknown',
      }));

    return {
      totalPools: data.pools?.length || 0,
      showing: pools.length,
      pools,
    };
  }
}
