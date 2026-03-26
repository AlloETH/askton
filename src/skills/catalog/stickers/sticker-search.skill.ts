import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'sticker_search',
  description:
    'Search TON NFT stickers and sticker collections by name. Returns matching stickers with collection info and current price.',
  example: { query: 'Skull' },
})
export class StickerSearchSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const query: string = input.query;
    if (!query || query.length < 2) return { error: 'Query must be at least 2 characters' };

    const limit: number = input.limit || 20;

    const { data } = await firstValueFrom(
      this.http.get('https://stickers.tools/api/v1/stickers/search', {
        params: { q: query, limit },
        timeout: 10000,
      }),
    );

    if (!data?.success) return { error: data?.error || 'Search failed' };

    return { query, count: data.data.length, results: data.data };
  }
}
