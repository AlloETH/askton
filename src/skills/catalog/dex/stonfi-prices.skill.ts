import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveJetton } from '../../resolve-jetton.js';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

@Skill({
  name: 'get_stonfi_prices',
  description:
    'Get real-time token prices from STON.fi DEX by name, symbol ($DOGS), or contract address. Use "TON" for native TON.',
  example: { token: 'DOGS or EQ...' },
})
export class StonfiPricesSkill implements SkillHandler {
  private apiKey: string;
  private assetsCache: CacheEntry<any[]> | null = null;

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

    // Try STON.fi asset list first
    try {
      const assets = await this.getStonfiAssets();
      const match = isNative
        ? assets.find((a: any) => a.kind === 'Ton')
        : assets.find((a: any) => a.contract_address === address);

      if (match?.third_party_usd_price) {
        return {
          token: address,
          symbol: match.symbol || null,
          name: match.display_name || null,
          priceUsd: match.third_party_usd_price,
          tvl: null,
          volume24h: null,
          source: 'stonfi',
        };
      }
    } catch {
      // STON.fi failed — fall back to TonAPI rates
    }

    // Fallback: TonAPI rates
    try {
      const headers = { Authorization: `Bearer ${this.apiKey}` };
      const [ratesRes, jettonRes] = await Promise.all([
        firstValueFrom(
          this.http.get(
            `https://tonapi.io/v2/rates?tokens=${address}&currencies=usd,ton`,
            { headers, timeout: 10000 },
          ),
        ),
        firstValueFrom(
          this.http.get(`https://tonapi.io/v2/jettons/${address}`, {
            headers,
            timeout: 10000,
          }),
        ).catch(() => null),
      ]);

      const rate = ratesRes.data.rates?.[address];
      const meta = jettonRes?.data?.metadata || {};

      if (rate?.prices?.USD) {
        return {
          token: address,
          symbol: meta.symbol || token,
          name: meta.name || null,
          priceUsd: rate.prices.USD,
          priceTon: rate.prices?.TON || null,
          change24h: rate.diff_24h?.USD || null,
          tvl: null,
          volume24h: null,
          source: 'tonapi',
        };
      }
    } catch {
      // TonAPI also failed
    }

    return { error: `Could not fetch price for "${token}"` };
  }

  private async getStonfiAssets(): Promise<any[]> {
    if (this.assetsCache && Date.now() < this.assetsCache.expiresAt) {
      return this.assetsCache.data;
    }

    const { data } = await firstValueFrom(
      this.http.get('https://api.ston.fi/v1/assets', { timeout: 15000 }),
    );
    const assets = data.asset_list || [];
    this.assetsCache = { data: assets, expiresAt: Date.now() + CACHE_TTL };
    return assets;
  }
}
