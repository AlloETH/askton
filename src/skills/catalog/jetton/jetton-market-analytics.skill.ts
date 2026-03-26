import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_jetton_analytics',
  description:
    'Get market analytics for a jetton — price, volume, market cap, holder trends. Use jetton contract address.',
  example: { jetton_address: 'EQ...' },
})
export class JettonMarketAnalyticsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.jetton_address;
    if (!address) return { error: 'Missing jetton_address' };

    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const [jettonRes, ratesRes] = await Promise.allSettled([
      firstValueFrom(
        this.http.get(`https://tonapi.io/v2/jettons/${address}`, {
          headers,
          timeout: 10000,
        }),
      ),
      firstValueFrom(
        this.http.get(
          `https://tonapi.io/v2/rates?tokens=${address}&currencies=usd,ton`,
          { headers, timeout: 10000 },
        ),
      ),
    ]);

    if (jettonRes.status === 'rejected') {
      return { error: 'Jetton not found' };
    }

    const jetton = jettonRes.value.data;
    const meta = jetton.metadata || {};
    const rates =
      ratesRes.status === 'fulfilled'
        ? ratesRes.value.data.rates?.[address]
        : null;

    const totalSupply = jetton.total_supply
      ? Number(BigInt(jetton.total_supply)) /
        10 ** parseInt(meta.decimals || '9', 10)
      : null;

    const priceUsd = rates?.prices?.USD || null;
    const marketCap =
      priceUsd && totalSupply ? priceUsd * totalSupply : null;

    return {
      address,
      symbol: meta.symbol || 'Unknown',
      name: meta.name || 'Unknown',
      verified: jetton.verification === 'whitelist',
      priceUsd,
      priceTon: rates?.prices?.TON || null,
      change24h: rates?.diff_24h?.USD || null,
      change7d: rates?.diff_7d?.USD || null,
      change30d: rates?.diff_30d?.USD || null,
      holders: jetton.holders_count || 0,
      totalSupply,
      marketCap,
      mintable: jetton.mintable ?? null,
    };
  }
}
