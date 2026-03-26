import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'sticker_floor',
  description:
    'Get floor prices of a TON NFT sticker across all marketplaces. Needs collection_id and sticker_id.',
  example: { collection_id: 'animals', sticker_id: 'fox' },
})
export class StickerFloorSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const { collection_id, sticker_id } = input;
    if (!collection_id || !sticker_id) return { error: 'Missing collection_id or sticker_id' };

    const { data } = await firstValueFrom(
      this.http.get(
        `https://stickers.tools/api/v1/stickers/${collection_id}/${sticker_id}/floor`,
        { timeout: 10000 },
      ),
    );

    if (!data?.success) return { error: data?.error || 'Failed to fetch floor' };

    return data.data;
  }
}
