import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_on_sale',
  description:
    'Get NFTs currently listed for sale in a collection on GetGems. Use collection contract address.',
  example: { collection_address: 'EQ...' },
})
export class GetGemsOnSaleSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('getgemsApiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.collection_address;
    if (!address) return { error: 'Missing collection_address' };

    const limit: number = input.limit || 20;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://api.getgems.io/public-api/v1/nfts/on-sale/${address}?limit=${limit}`,
        { headers: { Authorization: this.apiKey } },
      ),
    );

    const items = (data.items || data.nftItems || []).map((n: any) => ({
      address: n.address,
      name: n.name || n.metadata?.name,
      image: n.image || n.metadata?.image,
      price: n.sale?.price,
      currency: n.sale?.currency,
      owner: n.ownerAddress,
    }));

    return { collection: address, count: items.length, items };
  }
}
