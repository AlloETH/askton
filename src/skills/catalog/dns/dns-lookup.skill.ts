import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_dns_info',
  description:
    'check .ton domain status (available, owned, in auction), resolve to wallet address, and show auction pricing',
  example: { domain: 'example.ton' },
})
export class DnsLookupSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    let domain: string = (input.domain || '').toLowerCase().trim();
    domain = domain.replace(/\.ton$/, '');
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    if (domain.length < 4 || domain.length > 126) {
      return { error: 'Domain must be 4-126 characters' };
    }

    if (!/^[a-z0-9-]+$/.test(domain)) {
      return { error: 'Domain can only contain lowercase letters, numbers, and hyphens' };
    }

    const fullDomain = domain + '.ton';

    // Try to resolve the domain
    try {
      const { data } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/dns/${fullDomain}`, { headers }),
      );

      // Domain exists and is owned
      if (data.wallet?.address) {
        return {
          domain: fullDomain,
          status: 'owned',
          walletAddress: data.wallet.address,
          nftAddress: data.item?.address || null,
          expiresAt: data.expiring_at
            ? new Date(data.expiring_at * 1000).toISOString()
            : null,
        };
      }

      // Domain exists but in auction
      return await this.checkAuction(domain, fullDomain, headers);
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 404) {
        // Domain not minted — available
        const estimatedPrice = this.estimatePrice(domain.length);
        return {
          domain: fullDomain,
          status: 'available',
          estimatedPriceTon: estimatedPrice,
          note: 'Domain can be registered via dns.ton.org',
        };
      }

      return await this.checkAuction(domain, fullDomain, headers);
    }
  }

  private async checkAuction(
    domain: string,
    fullDomain: string,
    headers: any,
  ): Promise<any> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/dns/auctions?tld=ton`, { headers }),
      );

      const auction = (data.data || []).find(
        (a: any) => a.domain === domain || a.domain === fullDomain,
      );

      if (auction) {
        return {
          domain: fullDomain,
          status: 'auction',
          currentBidTon: Number(auction.price || 0) / 1e9,
          bids: auction.bids || 0,
          endsAt: auction.date
            ? new Date(auction.date * 1000).toISOString()
            : null,
        };
      }
    } catch {
      // auction check is best-effort
    }

    return {
      domain: fullDomain,
      status: 'unknown',
      note: 'Could not determine domain status',
    };
  }

  private estimatePrice(length: number): string {
    if (length === 4) return '~100 TON';
    if (length === 5) return '~50 TON';
    if (length <= 8) return '~10 TON';
    if (length <= 10) return '~5 TON';
    return '~1 TON';
  }
}
