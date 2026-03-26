import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveUsername } from '../../resolve-username.js';

@Skill({
  name: 'get_account_staking',
  description:
    'check what staking pools a TON wallet is participating in, with staked amounts and pending rewards',
  example: { address: 'UQ... or @username' },
})
export class AccountStakingSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.address;
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    let resolved = address;
    if (address.startsWith('@')) {
      resolved = await resolveUsername(this.http, address.slice(1), headers);
    }

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/staking/nominator/${resolved}/pools`,
        { headers },
      ),
    );

    const pools = (data.pools || []).map((p: any) => ({
      poolAddress: p.pool.address,
      poolName: p.pool.name || 'Unknown',
      apy: p.pool.apy ? (p.pool.apy * 100).toFixed(2) + '%' : 'N/A',
      stakedAmount: p.amount ? Number(p.amount) / 1e9 : 0,
      pendingDeposit: p.pending_deposit ? Number(p.pending_deposit) / 1e9 : 0,
      pendingWithdraw: p.pending_withdraw
        ? Number(p.pending_withdraw) / 1e9
        : 0,
      readyWithdraw: p.ready_withdraw ? Number(p.ready_withdraw) / 1e9 : 0,
    }));

    const totalStaked = pools.reduce(
      (sum: number, p: any) => sum + p.stakedAmount,
      0,
    );

    return {
      wallet: resolved,
      totalStakedTon: totalStaked,
      poolCount: pools.length,
      pools,
    };
  }
}
