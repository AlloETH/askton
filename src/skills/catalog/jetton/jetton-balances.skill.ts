import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveAddress } from '../../resolve-username.js';

@Skill({
  name: 'get_jetton_balances',
  description:
    'list all jetton (token) balances in a TON wallet, filtered by verification status',
  example: { address: 'UQ... or @username' },
})
export class JettonBalancesSkill implements SkillHandler {
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

    const resolved = await resolveAddress(this.http, address, headers);

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/accounts/${resolved}/jettons?currencies=usd`,
        { headers },
      ),
    );

    const balances = (data.balances || [])
      .filter((b: any) => b.jetton?.verification !== 'blacklist')
      .map((b: any) => {
        const meta = b.jetton || {};
        const decimals = parseInt(meta.decimals || '9', 10);
        const raw = BigInt(b.balance || '0');
        const divisor = BigInt(10) ** BigInt(decimals);
        const whole = raw / divisor;
        const frac = raw % divisor;
        const balance = Number(whole) + Number(frac) / Number(divisor);

        return {
          symbol: meta.symbol || 'Unknown',
          name: meta.name || 'Unknown',
          balance,
          balanceRaw: b.balance,
          decimals,
          address: meta.address || null,
          verification: meta.verification || 'unknown',
          priceUsd: b.price?.prices?.USD || null,
          valueUsd: b.price?.prices?.USD ? balance * b.price.prices.USD : null,
        };
      })
      .sort((a: any, b: any) => (b.valueUsd || 0) - (a.valueUsd || 0));

    const totalValue = balances.reduce(
      (sum: number, b: any) => sum + (b.valueUsd || 0),
      0,
    );

    return {
      wallet: resolved,
      tokenCount: balances.length,
      totalValueUsd: totalValue ? totalValue.toFixed(2) : null,
      balances,
    };
  }
}
