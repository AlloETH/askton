import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WalletSkill {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(address: string): Promise<any> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    // Resolve @username to address
    let resolved = address;
    if (address.startsWith('@')) {
      const dns = address.slice(1) + '.t.me';
      const { data } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/dns/${dns}/resolve`, { headers }),
      );
      resolved = data.wallet?.address || address;
    }

    // Fetch account info
    const { data: account } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/accounts/${resolved}`, { headers }),
    );

    // Fetch NFTs
    let nfts = [];
    try {
      const { data: nftData } = await firstValueFrom(
        this.http.get(`https://tonapi.io/v2/accounts/${resolved}/nfts?limit=20`, { headers }),
      );
      nfts = nftData.nft_items || [];
    } catch {
      // NFT fetch may fail for some accounts
    }

    const gifts = nfts
      .filter((n: any) => n.collection?.name?.toLowerCase().includes('gift') || n.metadata?.name)
      .map((n: any) => ({
        name: n.metadata?.name || 'Unknown',
        collection: n.collection?.name || 'Unknown',
      }));

    return {
      address: resolved,
      balanceTon: Number(account.balance) / 1e9,
      status: account.status,
      totalNfts: nfts.length,
      gifts,
    };
  }
}
