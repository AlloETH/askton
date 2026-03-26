import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { rawToFriendly } from './address-util.js';

@Skill({
  name: 'getgems_search',
  description:
    'Search for an NFT collection by NAME (not address). Use this when the user gives a collection name like "DOGS Origins", "TON Punks", etc. Returns collection address and stats.',
  example: { query: 'Dogs Origins' },
})
export class GetGemsSearchSkill implements SkillHandler {
  private tonapiKey: string;
  private getgemsApiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.tonapiKey = this.config.get<string>('tonapiKey')!;
    this.getgemsApiKey = this.config.get<string>('getgemsApiKey')!;
  }

  async execute(input: any): Promise<any> {
    const query: string = input.query;
    if (!query) return { error: 'Missing query' };

    // Search via TonAPI — filter to NFT collections only
    const { data } = await firstValueFrom(
      this.http.get('https://tonapi.io/v2/accounts/search', {
        headers: { Authorization: `Bearer ${this.tonapiKey}` },
        params: { name: query },
        timeout: 10000,
      }),
    );

    // TonAPI returns names like "DOGS Origins · collection", "Dogs · jetton"
    // Filter to collections only
    const collections = (data.addresses || [])
      .filter((a: any) => a.name?.includes('· collection'))
      .slice(0, 10);

    if (collections.length === 0) {
      return { query, count: 0, results: [], note: 'No NFT collections found' };
    }

    // Enrich top results with GetGems collection data
    const results = await Promise.all(
      collections.slice(0, 5).map(async (match: any) => {
        const rawAddr = match.address;
        const addr = rawAddr.includes(':')
          ? rawToFriendly(rawAddr)
          : rawAddr;
        const name = match.name?.replace(' · collection', '') || match.name;
        try {
          const { data: col } = await firstValueFrom(
            this.http.get(
              `https://api.getgems.io/public-api/v1/collection/${addr}`,
              {
                headers: { Authorization: this.getgemsApiKey },
                timeout: 10000,
              },
            ),
          );
          return {
            address: addr,
            name: col.name || name,
            description: col.description,
            isVerified: col.isVerified,
            floorPrice: col.floorPrice,
            itemCount: col.approximateItemsCount,
            ownerAddress: col.ownerAddress,
          };
        } catch {
          return {
            address: addr,
            name,
            isVerified: match.trust === 'whitelist',
          };
        }
      }),
    );

    return { query, count: results.length, results };
  }
}
