import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_nft_collection',
  description:
    'get NFT collection stats — floor price, item count, holder count, and recent items. Use collection contract address',
  example: { collection_address: 'EQ...' },
})
export class NftCollectionSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.collection_address;
    if (!address) return { error: 'Missing collection_address' };

    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/nfts/collections/${address}`, {
        headers,
      }),
    );

    const meta = data.metadata || {};

    // Fetch a sample of items
    let items: any[] = [];
    try {
      const { data: itemsData } = await firstValueFrom(
        this.http.get(
          `https://tonapi.io/v2/nfts/collections/${address}/items?limit=10`,
          { headers },
        ),
      );
      items = (itemsData.nft_items || []).map((n: any) => ({
        address: n.address,
        index: n.index,
        name: n.metadata?.name || null,
        image: n.metadata?.image || null,
        owner: n.owner?.address || null,
      }));
    } catch {
      // items fetch is best-effort
    }

    return {
      address,
      name: meta.name || 'Unknown',
      description: meta.description || '',
      image: meta.image || null,
      itemCount: data.next_item_index || 0,
      ownerAddress: data.owner?.address || null,
      recentItems: items,
    };
  }
}
