import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'sticker_sales_history',
  description:
    'Get recent sales history for TON NFT stickers. Can filter by collection or sticker number.',
  example: { limit: 20 },
})
export class StickerSalesHistorySkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const params: Record<string, any> = {
      limit: input.limit || 20,
      offset: input.offset || 0,
      sort: input.sort || 'block_time',
      order: input.order || 'DESC',
    };
    if (input.collections) params.collections = input.collections;
    if (input.sticker_number) params.sticker_number = input.sticker_number;

    const { data } = await firstValueFrom(
      this.http.get('https://stickers.tools/api/v1/market/history', {
        params,
        timeout: 10000,
      }),
    );

    if (!data?.success) return { error: data?.error || 'Failed to fetch history' };

    return { count: data.data.length, sales: data.data };
  }
}
