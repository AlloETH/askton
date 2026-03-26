import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';
import { resolveUsername } from '../../resolve-username';

@Skill({
  name: 'get_account_nfts',
  description:
    'list NFTs owned by a TON wallet (excludes Telegram gifts) — shows collection, name, image, and rarity attributes',
  example: { address: 'UQ... or @username', limit: 20 },
})
export class AccountNftsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.address;
    if (!address) return { error: 'Missing address' };

    const limit = Math.min(Math.max(input.limit || 20, 1), 100);
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    let resolved = address;
    if (address.startsWith('@')) {
      resolved = await resolveUsername(this.http, address.slice(1), headers);
    }

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/accounts/${resolved}/nfts?limit=${limit}&indirect_ownership=false`,
        { headers, timeout: 15000 },
      ),
    );

    const allNfts = (data.nft_items || []) as any[];

    // Filter out Telegram gifts
    const nfts = allNfts
      .filter((n: any) => {
        const colName = (n.collection?.name || '').toLowerCase();
        return !colName.includes('gift');
      })
      .map((n: any) => {
        const meta = n.metadata || {};
        const result: any = {
          name: meta.name || 'Unknown',
          collection: n.collection?.name || null,
          collectionAddress: n.collection?.address || null,
          address: n.address,
          image: meta.image || null,
          verified: n.trust === 'whitelist',
        };

        if (meta.attributes?.length) {
          result.attributes = meta.attributes.map((a: any) => ({
            trait: a.trait_type,
            value: a.value,
          }));
        }

        return result;
      });

    return {
      wallet: resolved,
      totalNfts: nfts.length,
      filteredOutGifts: allNfts.length - nfts.length,
      nfts,
    };
  }
}
