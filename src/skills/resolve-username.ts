import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface DnsResolveResponse {
  wallet?: { address?: string };
}

/**
 * Resolve a Telegram @username to a TON wallet address.
 * Uses the /resolve endpoint to get the actual DNS resolution target.
 * Tries .ton domain first, then .t.me as fallback.
 */
export async function resolveUsername(
  http: HttpService,
  username: string,
  headers: Record<string, string>,
): Promise<string> {
  // Try .ton domain first
  try {
    const { data } = await firstValueFrom(
      http.get<DnsResolveResponse>(
        `https://tonapi.io/v2/dns/${username}.ton/resolve`,
        { headers, timeout: 10000 },
      ),
    );
    if (data.wallet?.address) return data.wallet.address;
  } catch {
    // .ton domain not found or no wallet record
  }

  // Fallback to .t.me
  try {
    const { data } = await firstValueFrom(
      http.get<DnsResolveResponse>(
        `https://tonapi.io/v2/dns/${username}.t.me/resolve`,
        { headers, timeout: 10000 },
      ),
    );
    if (data.wallet?.address) return data.wallet.address;
  } catch {
    // .t.me not found either
  }

  return '@' + username;
}
