import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_user_nfts',
  description:
    'Get all NFTs owned by a wallet address on GetGems. Use TON wallet address.',
  example: { owner_address: 'EQ...' },
})
export class GetGemsUserNftsSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const address: string = input.owner_address;
    if (!address) return { error: 'Missing owner_address' };

    const limit: number = input.limit || 25;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://api.getgems.io/public-api/v1/nfts/owner/${address}?limit=${limit}`,
      ),
    );

    const items = (data.items || data.nftItems || []).map((n: any) => ({
      address: n.address,
      name: n.name || n.metadata?.name,
      image: n.image || n.metadata?.image,
      collection: n.collection?.name || n.collectionAddress,
      sale: n.sale
        ? { price: n.sale.price, currency: n.sale.currency }
        : null,
    }));

    return { owner: address, count: items.length, items };
  }
}
