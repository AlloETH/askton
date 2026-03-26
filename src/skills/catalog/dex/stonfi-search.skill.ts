import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface ScoredResult {
  asset: any;
  score: number;
  verification: string;
  holdersCount: number | null;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

@Skill({
  name: 'search_jetton',
  description:
    'search for a jetton (token) by name, symbol, or contract address — cross-references STON.fi and TonAPI for verified results with prices',
  example: { query: 'DOGS' },
})
export class StonfiSearchSkill implements SkillHandler {
  private apiKey: string;
  private stonfiCache: CacheEntry<any[]> | null = null;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const query: string = (input.query || '').trim();
    const limit = Math.min(Math.max(input.limit || 10, 1), 50);

    if (!query) {
      return {
        error:
          'Missing search query — provide a token name, symbol, or contract address',
      };
    }

    // Direct address lookup — skip search entirely
    if (/^[EU]Q[A-Za-z0-9_-]{46}$/.test(query)) {
      return this.lookupByAddress(query);
    }

    // Search TonAPI verified accounts first, then STON.fi for pricing
    const [tonapiSearch, stonfiAssets] = await Promise.all([
      this.searchTonapi(query),
      this.getStonfiAssets(),
    ]);

    const q = query.toLowerCase();
    const seen = new Set<string>();
    const scored: ScoredResult[] = [];

    // Add TonAPI verified results first (these are the real tokens)
    for (const item of tonapiSearch) {
      if (seen.has(item.address)) continue;
      seen.add(item.address);

      // Fetch full jetton details for verified hits
      const details = await this.checkJetton(item.address);
      const stonfi = stonfiAssets.find(
        (a: any) => a.contract_address === item.address,
      );

      let score = 0;
      if (item.trust === 'whitelist') score += 500;
      else if (item.trust === 'graylist') score += 50;

      const nameLC = (item.name || '').toLowerCase();
      if (nameLC.includes(q)) score += 50;

      scored.push({
        asset: {
          symbol: details?.symbol || item.name?.split('·')[0]?.trim() || query,
          display_name: details?.name || item.name?.split('·')[0]?.trim(),
          contract_address: item.address,
          decimals: details?.decimals ?? 9,
          third_party_usd_price: stonfi?.third_party_usd_price || null,
          image_url: item.preview || stonfi?.image_url || null,
        },
        score,
        verification: item.trust === 'whitelist' ? 'whitelist' : (item.trust || 'unknown'),
        holdersCount: details?.holdersCount ?? null,
      });
    }

    // Add STON.fi matches that aren't already from TonAPI
    const stonfiMatches = stonfiAssets.filter(
      (a: any) =>
        !a.blacklisted &&
        !a.deprecated &&
        !a.default_symbol &&
        !seen.has(a.contract_address) &&
        (a.symbol?.toLowerCase().includes(q) ||
          a.display_name?.toLowerCase().includes(q)),
    );

    for (const a of stonfiMatches) {
      let score = 0;
      const sym = (a.symbol || '').toLowerCase();
      const name = (a.display_name || '').toLowerCase();

      if (sym === q) score += 100;
      else if (sym.startsWith(q)) score += 50;
      else if (sym.includes(q)) score += 20;

      if (name === q) score += 80;
      else if (name.startsWith(q)) score += 30;
      else if (name.includes(q)) score += 10;

      if (a.third_party_usd_price) score += 15;
      if (a.community) score += 10;

      scored.push({
        asset: a,
        score,
        verification: 'unknown',
        holdersCount: null,
      });
    }

    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit);

    const results = top.map((s) => ({
      symbol: s.asset.symbol,
      name: s.asset.display_name,
      address: s.asset.contract_address,
      decimals: s.asset.decimals,
      verified: s.verification === 'whitelist',
      verification: s.verification,
      holdersCount: s.holdersCount,
      priceUsd: s.asset.third_party_usd_price || null,
      image: s.asset.image_url || null,
    }));

    const verified = results.filter((r) => r.verified);
    return {
      query,
      count: results.length,
      results,
      note:
        verified.length > 0
          ? `✅ ${verified.length} verified token(s) found. Top: "${verified[0].symbol}" (${verified[0].address})`
          : `⚠️ No verified tokens found. These may include fakes — use get_jetton_info with a known contract address for a reliable lookup.`,
    };
  }

  /** Direct lookup when user provides a contract address */
  private async lookupByAddress(address: string): Promise<any> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    try {
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
            {
              headers,
              timeout: 10000,
            },
          ),
        ),
      ]);

      if (jettonRes.status === 'rejected') {
        return { error: 'Token not found at this address' };
      }

      const jetton = jettonRes.value.data;
      const meta = jetton.metadata || {};
      const rates =
        ratesRes.status === 'fulfilled'
          ? ratesRes.value.data.rates?.[address]
          : null;

      return {
        query: address,
        count: 1,
        results: [
          {
            symbol: meta.symbol || 'Unknown',
            name: meta.name || 'Unknown',
            address,
            decimals: parseInt(meta.decimals || '9', 10),
            verified: jetton.verification === 'whitelist',
            verification: jetton.verification || 'none',
            holdersCount: jetton.holders_count || 0,
            priceUsd: rates?.prices?.USD || null,
            priceTon: rates?.prices?.TON || null,
            change24h: rates?.diff_24h?.USD || null,
            image: meta.image || null,
          },
        ],
      };
    } catch {
      return { error: 'Failed to look up token — check the address format' };
    }
  }

  /** Search TonAPI accounts by name — returns verified jettons */
  private async searchTonapi(
    query: string,
  ): Promise<
    Array<{ address: string; name: string; preview: string; trust: string }>
  > {
    const headers = { Authorization: `Bearer ${this.apiKey}` };
    try {
      const { data } = await firstValueFrom(
        this.http.get('https://tonapi.io/v2/accounts/search', {
          headers,
          params: { name: query },
          timeout: 10000,
        }),
      );
      // Filter to jetton accounts only
      return (data.addresses || []).filter(
        (a: any) =>
          a.name?.includes('jetton') || a.trust === 'whitelist',
      );
    } catch {
      return [];
    }
  }

  /** Cached STON.fi full asset list */
  private async getStonfiAssets(): Promise<any[]> {
    if (this.stonfiCache && Date.now() < this.stonfiCache.expiresAt) {
      return this.stonfiCache.data;
    }

    try {
      const { data } = await firstValueFrom(
        this.http.get('https://api.ston.fi/v1/assets', { timeout: 15000 }),
      );
      const assets = data.asset_list || [];
      this.stonfiCache = { data: assets, expiresAt: Date.now() + CACHE_TTL };
      return assets;
    } catch {
      return this.stonfiCache?.data || [];
    }
  }

  /** Individual jetton check — returns verification, holders, and metadata */
  private async checkJetton(
    address: string,
  ): Promise<{
    verification: string;
    holdersCount: number;
    symbol: string;
    name: string;
    decimals: number;
  } | null> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    try {
      const { data } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/jettons/${address}`, {
          headers,
          timeout: 10000,
        }),
      );
      const meta = data.metadata || {};
      return {
        verification: data.verification || 'none',
        holdersCount: data.holders_count || 0,
        symbol: meta.symbol || '',
        name: meta.name || '',
        decimals: parseInt(meta.decimals || '9', 10),
      };
    } catch {
      return null;
    }
  }
}
