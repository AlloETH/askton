import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'sticker_summary',
  description:
    'Get full summary of a TON NFT sticker — price, floor, supply, volume, recent trades. Needs collection_id and sticker_id (use sticker_search first to find them).',
  example: { collection_id: 'animals', sticker_id: 'fox' },
})
export class StickerSummarySkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const { collection_id, sticker_id } = input;
    if (!collection_id || !sticker_id) return { error: 'Missing collection_id or sticker_id' };

    const tradesLimit: number = input.trades_limit || 10;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://stickers.tools/api/v1/stickers/${collection_id}/${sticker_id}/summary`,
        {
          params: { trades_limit: tradesLimit },
          timeout: 10000,
        },
      ),
    );

    if (!data?.success) return { error: data?.error || 'Failed to fetch summary' };

    return data.data;
  }
}
