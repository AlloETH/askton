import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_nft',
  description:
    'Get NFT details from GetGems — name, price, sale status, rarity, owner, collection. Use NFT contract address.',
  example: { nft_address: 'EQ...' },
})
export class GetGemsNftSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('getgemsApiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.nft_address;
    if (!address) return { error: 'Missing nft_address' };

    const { data } = await firstValueFrom(
      this.http.get(
        `https://api.getgems.io/public-api/v1/nft/${address}?addRarity=true`,
        { headers: { 'X-Api-Key': this.apiKey } },
      ),
    );

    return {
      address: data.address,
      name: data.name || data.metadata?.name,
      description: data.metadata?.description,
      image: data.image || data.metadata?.image,
      owner: data.ownerAddress,
      collection: data.collection
        ? {
            address: data.collection.address,
            name: data.collection.name,
          }
        : null,
      sale: data.sale
        ? {
            type: data.sale.type,
            price: data.sale.price,
            currency: data.sale.currency,
            marketplace: data.sale.marketplace,
          }
        : null,
      rarity: data.rarity || null,
      attributes: data.metadata?.attributes || data.attributes || null,
    };
  }
}
