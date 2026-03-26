import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_collection',
  description:
    'Get NFT collection info from GetGems marketplace — floor price, stats, owner count, volume. Use collection contract address.',
  example: { collection_address: 'EQ...' },
})
export class GetGemsCollectionSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const address: string = input.collection_address;
    if (!address) return { error: 'Missing collection_address' };

    const base = 'https://api.getgems.io/public-api/v1';

    const [infoRes, statsRes] = await Promise.all([
      firstValueFrom(this.http.get(`${base}/collection/${address}`)),
      firstValueFrom(
        this.http.get(`${base}/collection/stats/${address}`),
      ).catch(() => null),
    ]);

    const info = infoRes.data;
    const stats = statsRes?.data;

    return {
      address: info.address,
      name: info.name || info.metadata?.name,
      description: info.description || info.metadata?.description,
      image: info.image || info.metadata?.image,
      isVerified: info.isVerified,
      ownerAddress: info.ownerAddress,
      floorPrice: info.floorPrice,
      itemCount: info.approximateItemsCount,
      stats: stats
        ? {
            holders: stats.holdersCount,
            totalVolume: stats.totalVolumeTon,
            volume24h: stats.volumeTon24h,
            volume7d: stats.volumeTon7d,
            floorPriceTon: stats.floorPriceTon,
            listedCount: stats.listedCount,
            salesCount24h: stats.salesCount24h,
          }
        : null,
    };
  }
}
