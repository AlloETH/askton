import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_balance_change',
  description:
    'get TON balance change for a wallet over a time period — shows how much was gained or lost',
  example: { address: 'UQ...', start_date: '2025-01-01', end_date: '2025-03-01' },
})
export class BalanceChangeSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.address;
    if (!address) return { error: 'Missing address' };

    const headers = { Authorization: `Bearer ${this.apiKey}` };

    let resolved = address;
    if (address.startsWith('@')) {
      const dns = address.slice(1) + '.t.me';
      const { data } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/dns/${dns}/resolve`, { headers }),
      );
      resolved = data.wallet?.address || address;
    }

    const startDate = input.start_date
      ? Math.floor(new Date(input.start_date).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 86400 * 30; // default 30 days
    const endDate = input.end_date
      ? Math.floor(new Date(input.end_date).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/accounts/${resolved}/diff?start_date=${startDate}&end_date=${endDate}`,
        { headers },
      ),
    );

    const balanceDiff = data.balance_change
      ? Number(data.balance_change) / 1e9
      : null;

    return {
      wallet: resolved,
      startDate: new Date(startDate * 1000).toISOString(),
      endDate: new Date(endDate * 1000).toISOString(),
      balanceChangeTon: balanceDiff,
    };
  }
}
