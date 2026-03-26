import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface DnsResolveResponse {
  wallet?: { address?: string };
}

/**
 * Resolve a TON address input to a raw wallet address.
 * Handles @username (tries .ton then .t.me), .ton domains, and .t.me domains.
 * Returns the original input unchanged if it's already a raw/friendly address.
 */
export async function resolveAddress(
  http: HttpService,
  input: string,
  headers: Record<string, string>,
): Promise<string> {
  // Already a raw or friendly address — return as-is
  if (
    input.startsWith('EQ') ||
    input.startsWith('UQ') ||
    input.startsWith('0:') ||
    input.startsWith('-1:')
  ) {
    return input;
  }

  // .ton or .t.me domain — resolve directly
  if (input.endsWith('.ton') || input.endsWith('.t.me')) {
    return resolveDomain(http, input, headers);
  }

  // @username — try .ton then .t.me
  const username = input.startsWith('@') ? input.slice(1) : input;

  const tonResult = await resolveDomain(
    http,
    `${username}.ton`,
    headers,
  );
  if (tonResult !== `${username}.ton`) return tonResult;

  const tmeResult = await resolveDomain(
    http,
    `${username}.t.me`,
    headers,
  );
  if (tmeResult !== `${username}.t.me`) return tmeResult;

  return input;
}

async function resolveDomain(
  http: HttpService,
  domain: string,
  headers: Record<string, string>,
): Promise<string> {
  try {
    const { data } = await firstValueFrom(
      http.get<DnsResolveResponse>(
        `https://tonapi.io/v2/dns/${encodeURIComponent(domain)}/resolve`,
        { headers, timeout: 10000 },
      ),
    );
    if (data.wallet?.address) return data.wallet.address;
  } catch {
    // domain not found or no wallet record
  }
  return domain;
}

/** @deprecated Use resolveAddress instead */
export const resolveUsername = resolveAddress;
