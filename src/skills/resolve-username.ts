import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface DnsResponse {
  wallet?: { address?: string };
  item?: { owner?: { address?: string } };
}

/**
 * Resolve a Telegram @username to a TON wallet address.
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
      http.get<DnsResponse>(`https://tonapi.io/v2/dns/${username}.ton`, {
        headers,
        timeout: 10000,
      }),
    );
    if (data.wallet?.address) return data.wallet.address;
    if (data.item?.owner?.address) return data.item.owner.address;
  } catch {
    // .ton domain not found
  }

  // Fallback to .t.me
  try {
    const { data } = await firstValueFrom(
      http.get<DnsResponse>(`https://tonapi.io/v2/dns/${username}.t.me`, {
        headers,
        timeout: 10000,
      }),
    );
    if (data.wallet?.address) return data.wallet.address;
    if (data.item?.owner?.address) return data.item.owner.address;
  } catch {
    // .t.me not found either
  }

  return '@' + username;
}
