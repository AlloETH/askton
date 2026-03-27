import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveJetton } from '../../resolve-jetton.js';

@Skill({
  name: 'get_jetton_holders',
  description:
    'list top holders of a jetton (token) by name, symbol ($DOGS), or contract address — useful for whale analysis',
  example: { jetton_address: 'DOGS or EQ...', limit: 10 },
})
export class JettonHoldersSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const raw: string = input.jetton_address || '';
    const limit = Math.min(Math.max(input.limit || 10, 1), 100);
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const resolved = await resolveJetton(this.http, raw, this.apiKey);
    if (!resolved) return { error: `Token "${raw}" not found` };
    const address = resolved.address;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/jettons/${address}/holders?limit=${limit}`,
        { headers },
      ),
    );

    const { data: jettonData } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/jettons/${address}`, { headers }),
    );

    const meta = jettonData.metadata || {};
    const decimals = parseInt(meta.decimals || '9', 10);
    const symbol = meta.symbol || 'Unknown';
    const divisor = BigInt(10) ** BigInt(decimals);

    const holders = (data.addresses || []).map((h: any, i: number) => {
      const rawBal = BigInt(h.balance || '0');
      const whole = rawBal / divisor;
      const frac = rawBal % divisor;
      const balance = Number(whole) + Number(frac) / Number(divisor);

      return {
        rank: i + 1,
        address: h.owner?.address || 'Unknown',
        name: h.owner?.name || null,
        balance,
        balanceRaw: h.balance,
      };
    });

    return {
      jetton: address,
      symbol,
      totalHolders: jettonData.holders_count || null,
      holders,
    };
  }
}
