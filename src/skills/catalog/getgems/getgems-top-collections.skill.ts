import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_top_collections',
  description:
    'Get top NFT collections on GetGems by volume. Supports period: day, week, month, all.',
  example: { period: 'week' },
})
export class GetGemsTopCollectionsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('getgemsApiKey')!;
  }

  async execute(input: any): Promise<any> {
    const period: string = input.period || 'week';
    const limit: number = input.limit || 15;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://api.getgems.io/public-api/v1/collections/top?kind=${period}&limit=${limit}`,
        { headers: { 'X-Api-Key': this.apiKey } },
      ),
    );

    const collections = (data.items || data || []).map((c: any) => ({
      address: c.address,
      name: c.name,
      image: c.image,
      floorPrice: c.floorPrice,
      volume: c.volume,
      itemCount: c.approximateItemsCount,
      isVerified: c.isVerified,
    }));

    return { period, collections };
  }
}
