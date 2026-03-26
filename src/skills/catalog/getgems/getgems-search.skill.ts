import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

const SEARCH_QUERY = `
query NftSearch($query: String!, $first: Int!) {
  alphaNftCollectionSearch(query: $query, first: $first) {
    edges {
      node {
        address
        name
        description
        approximateItemsCount
        approximateHoldersCount
        isVerified
        floorPriceNano
      }
    }
  }
}`;

@Skill({
  name: 'getgems_search',
  description:
    'Search for an NFT collection by name on GetGems. Returns collection address, floor price, and stats. Use for any NFT collection lookup by name.',
  example: { query: 'Dogs Origins' },
})
export class GetGemsSearchSkill implements SkillHandler {
  private apiKey: string;
  private tonapiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('getgemsApiKey')!;
    this.tonapiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const query: string = input.query;
    if (!query) return { error: 'Missing query' };

    // Try GetGems GraphQL first
    try {
      const { data } = await firstValueFrom(
        this.http.post(
          'https://api.getgems.io/graphql',
          {
            query: SEARCH_QUERY,
            variables: { query, first: 10 },
          },
          {
            headers: { Authorization: this.apiKey },
            timeout: 10000,
          },
        ),
      );

      const edges = data?.data?.alphaNftCollectionSearch?.edges || [];
      if (edges.length > 0) {
        const results = edges.map((e: any) => {
          const n = e.node;
          return {
            address: n.address,
            name: n.name,
            description: n.description,
            isVerified: n.isVerified,
            itemCount: n.approximateItemsCount,
            holders: n.approximateHoldersCount,
            floorPriceNano: n.floorPriceNano,
          };
        });
        return { query, count: results.length, results };
      }
    } catch {
      // Fall through to TonAPI fallback
    }

    // Fallback: TonAPI accounts search
    const headers = { Authorization: `Bearer ${this.tonapiKey}` };
    const { data } = await firstValueFrom(
      this.http.get('https://tonapi.io/v2/accounts/search', {
        headers,
        params: { name: query },
        timeout: 10000,
      }),
    );

    const results = (data.addresses || [])
      .filter((a: any) => a.is_wallet === false || a.icon)
      .slice(0, 10)
      .map((a: any) => ({
        address: a.address,
        name: a.name,
        isVerified: a.trust === 'whitelist',
      }));

    if (results.length === 0) {
      return { query, count: 0, results: [], note: 'No NFT collections found' };
    }

    return { query, count: results.length, results };
  }
}
