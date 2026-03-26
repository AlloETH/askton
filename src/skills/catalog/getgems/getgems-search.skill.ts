import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_search',
  description:
    'Search for an NFT collection by name on GetGems. Returns collection address, floor price, and stats. Use for any NFT collection lookup by name.',
  example: { query: 'Dogs Origins' },
})
export class GetGemsSearchSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('getgemsApiKey')!;
  }

  async execute(input: any): Promise<any> {
    const query: string = input.query;
    if (!query) return { error: 'Missing query' };

    const headers = { 'X-Api-Key': this.apiKey };
    const base = 'https://api.getgems.io/public-api/v1';

    const { data } = await firstValueFrom(
      this.http.get(`${base}/collections/search`, {
        headers,
        params: { query, limit: 10 },
        timeout: 10000,
      }),
    );

    const collections = (data.items || data || []).map((c: any) => ({
      address: c.address,
      name: c.name,
      description: c.description,
      image: c.image,
      isVerified: c.isVerified,
      floorPrice: c.floorPrice,
      itemCount: c.approximateItemsCount,
      ownerAddress: c.ownerAddress,
    }));

    if (collections.length === 0) {
      return { query, count: 0, results: [], note: 'No NFT collections found' };
    }

    return { query, count: collections.length, results: collections };
  }
}
