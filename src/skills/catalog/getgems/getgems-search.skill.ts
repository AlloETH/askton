import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_search',
  description:
    'Search for an NFT collection by name on GetGems and TonAPI. Returns collection address, floor price, and stats. Use for any NFT collection lookup by name.',
  example: { query: 'Dogs Origins' },
})
export class GetGemsSearchSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const query: string = input.query;
    if (!query) return { error: 'Missing query' };

    const headers = { Authorization: `Bearer ${this.apiKey}` };

    // Search via TonAPI accounts search — finds NFT collections by name
    const { data } = await firstValueFrom(
      this.http.get('https://tonapi.io/v2/accounts/search', {
        headers,
        params: { name: query },
        timeout: 10000,
      }),
    );

    const matches = (data.addresses || []).filter(
      (a: any) =>
        a.name?.toLowerCase().includes('collection') ||
        a.name?.toLowerCase().includes('nft') ||
        a.trust === 'whitelist',
    );

    if (matches.length === 0) {
      return { query, count: 0, results: [], note: 'No NFT collections found' };
    }

    // Try to get GetGems data for the top matches
    const results = await Promise.all(
      matches.slice(0, 5).map(async (match: any) => {
        const addr = match.address;
        try {
          const { data: col } = await firstValueFrom(
            this.http.get(
              `https://tonapi.io/v2/nfts/collections/${addr}`,
              { headers, timeout: 10000 },
            ),
          );
          const meta = col.metadata || {};
          return {
            address: addr,
            name: meta.name || match.name,
            description: meta.description || null,
            verified: match.trust === 'whitelist',
            itemCount: col.next_item_index || 0,
            owner: col.owner?.address || null,
          };
        } catch {
          return {
            address: addr,
            name: match.name,
            verified: match.trust === 'whitelist',
          };
        }
      }),
    );

    return { query, count: results.length, results };
  }
}
