import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/** Cached DeDust asset list with TTL */
interface CacheEntry {
  data: DedustAsset[];
  expiresAt: number;
}

export interface DedustAsset {
  type: string;
  address?: string;
  symbol: string;
  name?: string;
  decimals: number;
  price?: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let dedustCache: CacheEntry | null = null;

// ─── Address detection ──────────────────────────────────────────────

export function isAddress(input: string): boolean {
  return (
    /^[EU]Q[A-Za-z0-9_-]{46}$/.test(input) ||
    input.startsWith('0:') ||
    input.startsWith('-1:')
  );
}

// ─── String-based decimal handling (avoids floating-point precision loss) ─

export function toUnits(amount: number, decimals: number): bigint {
  const str = amount.toFixed(decimals);
  const [whole, frac = ''] = str.split('.');
  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + padded);
}

export function fromUnits(units: bigint, decimals: number): number {
  const factor = 10 ** decimals;
  return Number(units) / factor;
}

// ─── DeDust asset cache ─────────────────────────────────────────────

export async function getDedustAssets(
  http: HttpService,
): Promise<DedustAsset[]> {
  if (dedustCache && Date.now() < dedustCache.expiresAt) {
    return dedustCache.data;
  }

  try {
    const { data } = await firstValueFrom(
      http.get('https://api.dedust.io/v2/assets', { timeout: 15000 }),
    );
    const assets: DedustAsset[] = (data || []).map((a: any) => ({
      type: a.type,
      address: a.address,
      symbol: a.symbol || '',
      name: a.name || '',
      decimals: a.decimals ?? 9,
      price: a.price ?? undefined,
    }));
    dedustCache = { data: assets, expiresAt: Date.now() + CACHE_TTL };
    return assets;
  } catch {
    return dedustCache?.data || [];
  }
}

export async function findAssetBySymbol(
  http: HttpService,
  symbol: string,
): Promise<DedustAsset | undefined> {
  const assets = await getDedustAssets(http);
  const upper = symbol.toUpperCase();
  return assets.find((a) => a.symbol.toUpperCase() === upper);
}

export async function getDecimals(
  http: HttpService,
  addressOrTon: string,
): Promise<number> {
  if (addressOrTon.toLowerCase() === 'ton') return 9;
  const asset = await findAssetBySymbol(http, addressOrTon);
  return asset?.decimals ?? 9;
}

// ─── Jetton symbol → address resolution ─────────────────────────────

/**
 * Resolve a jetton symbol/name to a contract address.
 * If the input is already an address, returns it as-is.
 * Otherwise searches TonAPI for whitelisted jettons and falls back to DeDust cache.
 */
export async function resolveJetton(
  http: HttpService,
  input: string,
  tonapiKey: string,
): Promise<{ address: string; symbol?: string; decimals?: number } | null> {
  const clean = input.replace(/^\$/, '').trim();

  if (isAddress(clean)) {
    return { address: clean };
  }

  if (clean.toLowerCase() === 'ton') {
    return {
      address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      symbol: 'TON',
      decimals: 9,
    };
  }

  // Try TonAPI search — whitelisted jettons
  try {
    const { data } = await firstValueFrom(
      http.get('https://tonapi.io/v2/accounts/search', {
        headers: { Authorization: `Bearer ${tonapiKey}` },
        params: { name: clean },
        timeout: 10000,
      }),
    );
    const match = (data.addresses || []).find(
      (a: any) =>
        a.trust === 'whitelist' &&
        (a.name?.toLowerCase().includes('jetton') ||
          a.name?.toLowerCase().includes(clean.toLowerCase())),
    );
    if (match?.address) {
      return { address: match.address };
    }
  } catch {
    // fall through to DeDust
  }

  // Fallback: DeDust asset cache
  const asset = await findAssetBySymbol(http, clean);
  if (asset?.address) {
    return {
      address: asset.address,
      symbol: asset.symbol,
      decimals: asset.decimals,
    };
  }

  return null;
}
