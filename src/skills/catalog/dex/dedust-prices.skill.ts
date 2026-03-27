import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveJetton } from '../../resolve-jetton.js';

@Skill({
  name: 'get_dedust_prices',
  description:
    'Get real-time token prices from DeDust DEX by name, symbol ($DOGS), or contract address. Use "TON" for native TON.',
  example: { token: 'DOGS or EQ...' },
})
export class DedustPricesSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const token: string = input.token;
    if (!token) return { error: 'Missing token' };

    const isNative = token.toUpperCase() === 'TON';
    let address = token;

    if (!isNative) {
      const resolved = await resolveJetton(this.http, token, this.apiKey);
      if (!resolved) return { error: `Token "${token}" not found` };
      address = resolved.address;
    }

    const assetStr = isNative ? 'native' : `jetton:${address}`;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://api.dedust.io/v2/assets/${encodeURIComponent(assetStr)}`,
        { timeout: 10000 },
      ),
    );

    return {
      token: address,
      symbol: data.symbol || data.metadata?.symbol,
      name: data.name || data.metadata?.name,
      priceUsd: data.price ?? null,
      tvl: data.tvl ?? null,
      volume24h: data.volume24h ?? null,
    };
  }
}
