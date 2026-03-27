import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveJetton } from '../../resolve-jetton.js';

@Skill({
  name: 'get_jetton_price',
  description:
    'get current price of a jetton (token) by name, symbol ($DOGS), or contract address — returns USD/TON price with 24h/7d/30d changes',
  example: { jetton_address: 'DOGS or EQ...' },
})
export class JettonPriceSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const raw: string = input.jetton_address || '';
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const resolved = await resolveJetton(this.http, raw, this.apiKey);
    if (!resolved) return { error: `Token "${raw}" not found` };
    const address = resolved.address;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/rates?tokens=${address}&currencies=usd,ton`,
        { headers },
      ),
    );

    const rates = data.rates?.[address];
    if (!rates) {
      try {
        await firstValueFrom(
          this.http.get(`https://tonapi.io/v2/jettons/${address}`, { headers }),
        );
        return { error: 'Token exists but has no liquidity/price data' };
      } catch {
        return { error: 'Token not found' };
      }
    }

    const prices = rates.prices || {};
    const diff24h = rates.diff_24h || {};
    const diff7d = rates.diff_7d || {};
    const diff30d = rates.diff_30d || {};

    let symbol = resolved.symbol || address;
    let name = '';
    try {
      const { data: meta } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/jettons/${address}`, { headers }),
      );
      symbol = meta.metadata?.symbol || symbol;
      name = meta.metadata?.name || '';
    } catch {
      // metadata fetch is best-effort
    }

    return {
      address,
      symbol,
      name,
      priceUsd: prices.USD || null,
      priceTon: prices.TON || null,
      change24h: diff24h.USD || null,
      change7d: diff7d.USD || null,
      change30d: diff30d.USD || null,
    };
  }
}
