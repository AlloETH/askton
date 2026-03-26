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
  private tonapiCache: CacheEntry<
    Map<string, { verification: string; holdersCount: number }>
  > | null = null;

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

    const [stonfiAssets, tonapiMap] = await Promise.all([
      this.getStonfiAssets(),
      this.getTonapiJettons(),
    ]);

    if (stonfiAssets.length === 0 && tonapiMap.size === 0) {
      return {
        error: 'Both STON.fi and TonAPI are unreachable — try again later',
      };
    }

    const q = query.toLowerCase();

    // Filter STON.fi matches
    const matches = stonfiAssets.filter(
      (a: any) =>
        !a.blacklisted &&
        !a.deprecated &&
        !a.default_symbol &&
        (a.symbol?.toLowerCase().includes(q) ||
          a.display_name?.toLowerCase().includes(q)),
    );

    // Score and rank
    const scored: ScoredResult[] = matches.map((a: any) => {
      let score = 0;
      const sym = (a.symbol || '').toLowerCase();
      const name = (a.display_name || '').toLowerCase();

      if (sym === q) score += 100;
      else if (sym.startsWith(q)) score += 50;
      else if (sym.includes(q)) score += 20;

      if (name === q) score += 80;
      else if (name.startsWith(q)) score += 30;
      else if (name.includes(q)) score += 10;

      const tonapi = tonapiMap.get(a.contract_address);
      if (tonapi) {
        if (tonapi.verification === 'whitelist') score += 200;
        if (tonapi.holdersCount > 100_000) score += 50;
        else if (tonapi.holdersCount > 10_000) score += 30;
        else if (tonapi.holdersCount > 1_000) score += 15;
      }

      if (a.third_party_usd_price) score += 15;
      if (a.community) score += 10;

      return {
        asset: a,
        score,
        verification: tonapi?.verification || 'unknown',
        holdersCount: tonapi?.holdersCount ?? null,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    // For high-scoring results without TonAPI data, verify individually
    const needsCheck = scored
      .filter((s) => s.verification === 'unknown' && s.score >= 50)
      .slice(0, 5);

    if (needsCheck.length > 0) {
      const checks = await Promise.all(
        needsCheck.map((s) => this.checkJetton(s.asset.contract_address)),
      );
      for (let i = 0; i < needsCheck.length; i++) {
        const check = checks[i];
        if (!check) continue;
        needsCheck[i].verification = check.verification;
        needsCheck[i].holdersCount = check.holdersCount;
        if (check.verification === 'whitelist') needsCheck[i].score += 200;
        if (check.holdersCount > 100_000) needsCheck[i].score += 50;
        else if (check.holdersCount > 10_000) needsCheck[i].score += 30;
        else if (check.holdersCount > 1_000) needsCheck[i].score += 15;
      }
      scored.sort((a, b) => b.score - a.score);
    }

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
      totalMatches: matches.length,
      results,
      note:
        verified.length > 0
          ? `✅ ${verified.length} verified token(s) found. Top: "${verified[0].symbol}" (${verified[0].address})`
          : `⚠️ No verified tokens found among ${matches.length} results. These may include fakes — use get_jetton_info with a known contract address for a reliable lookup.`,
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

  /** Cached TonAPI jetton list with verification + holder counts */
  private async getTonapiJettons(): Promise<
    Map<string, { verification: string; holdersCount: number }>
  > {
    if (this.tonapiCache && Date.now() < this.tonapiCache.expiresAt) {
      return this.tonapiCache.data;
    }

    const headers = { Authorization: `Bearer ${this.apiKey}` };
    try {
      const { data } = await firstValueFrom(
        this.http.get('https://tonapi.io/v2/jettons', {
          headers,
          params: { limit: 200, offset: 0 },
          timeout: 15000,
        }),
      );

      const map = new Map<
        string,
        { verification: string; holdersCount: number }
      >();
      for (const j of data.jettons || []) {
        const addr = j.metadata?.address || j.address;
        if (addr) {
          map.set(addr, {
            verification: j.verification || 'none',
            holdersCount: j.holders_count || 0,
          });
        }
      }
      this.tonapiCache = { data: map, expiresAt: Date.now() + CACHE_TTL };
      return map;
    } catch {
      return this.tonapiCache?.data || new Map();
    }
  }

  /** Individual jetton check for tokens not in the bulk list */
  private async checkJetton(
    address: string,
  ): Promise<{ verification: string; holdersCount: number } | null> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    try {
      const { data } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/jettons/${address}`, {
          headers,
          timeout: 10000,
        }),
      );
      return {
        verification: data.verification || 'none',
        holdersCount: data.holders_count || 0,
      };
    } catch {
      return null;
    }
  }
}
