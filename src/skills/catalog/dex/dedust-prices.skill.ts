import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_dedust_prices',
  description:
    'Get real-time token prices from DeDust DEX. Provide a jetton contract address or "TON".',
  example: { token: 'EQ...jetton_address' },
})
export class DedustPricesSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const token: string = input.token;
    if (!token) return { error: 'Missing token address' };

    const isNative = token.toUpperCase() === 'TON';
    const assetStr = isNative
      ? 'native'
      : `jetton:${token}`;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://api.dedust.io/v2/assets/${encodeURIComponent(assetStr)}`,
        { timeout: 10000 },
      ),
    );

    return {
      token,
      symbol: data.symbol || data.metadata?.symbol,
      name: data.name || data.metadata?.name,
      priceUsd: data.price ?? null,
      tvl: data.tvl ?? null,
      volume24h: data.volume24h ?? null,
    };
  }
}
