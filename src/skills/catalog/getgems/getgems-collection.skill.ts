import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { rawToFriendly } from './address-util.js';

@Skill({
  name: 'getgems_collection',
  description:
    'Get NFT collection info by contract ADDRESS (starts with EQ/UQ). Do NOT use if you only have a name — use getgems_search instead. Returns floor price, stats, volume.',
  example: { collection_address: 'EQ...' },
})
export class GetGemsCollectionSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('getgemsApiKey')!;
  }

  async execute(input: any): Promise<any> {
    let address: string = input.collection_address;
    if (!address) return { error: 'Missing collection_address' };

    // Convert raw format (0:hex) to friendly (EQ...) for GetGems API
    if (address.includes(':')) {
      address = rawToFriendly(address);
    }

    const headers = { Authorization: this.apiKey };
    const base = 'https://api.getgems.io/public-api/v1';

    const [infoRes, statsRes] = await Promise.all([
      firstValueFrom(this.http.get(`${base}/collection/${address}`, { headers })),
      firstValueFrom(
        this.http.get(`${base}/collection/stats/${address}`, { headers }),
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
