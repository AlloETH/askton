import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

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
    let address: string = (input.jetton_address || '').replace(/^\$/, '').trim();
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    // If not a valid address, search for the token by name/symbol
    if (!this.isAddress(address)) {
      const resolved = await this.resolveByName(address, headers);
      if (!resolved) return { error: `Token "${address}" not found` };
      address = resolved;
    }

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/rates?tokens=${address}&currencies=usd,ton`,
        { headers },
      ),
    );

    const rates = data.rates?.[address];
    if (!rates) {
      // Check if token exists at all
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

    // Fetch metadata for symbol/name
    let symbol = address;
    let name = '';
    try {
      const { data: meta } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/jettons/${address}`, { headers }),
      );
      symbol = meta.metadata?.symbol || address;
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

  private isAddress(input: string): boolean {
    return (
      input.startsWith('EQ') ||
      input.startsWith('UQ') ||
      input.startsWith('0:') ||
      input.startsWith('-1:')
    );
  }

  private async resolveByName(
    query: string,
    headers: Record<string, string>,
  ): Promise<string | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.get('https://tonapi.io/v2/accounts/search', {
          headers,
          params: { name: query },
          timeout: 10000,
        }),
      );
      // Find the first whitelisted jetton
      const match = (data.addresses || []).find(
        (a: any) =>
          a.trust === 'whitelist' &&
          (a.name?.toLowerCase().includes('jetton') ||
            a.name?.toLowerCase().includes(query.toLowerCase())),
      );
      return match?.address || null;
    } catch {
      return null;
    }
  }
}
