import { Skill, SkillHandler } from '../../skill.decorator';
import { MtprotoService } from '../../../telegram/mtproto.service';

@Skill({
  name: 'search_telegram',
  description:
    'search for public Telegram channels, groups, and users by keyword (requires MTProto)',
  example: { query: 'TON blockchain', limit: 10 },
})
export class SearchPublicSkill implements SkillHandler {
  constructor(private mtproto: MtprotoService) {}

  async execute(input: any): Promise<any> {
    const query: string = input.query || input.q || input.search;
    if (!query) return { error: 'Missing search query' };

    if (!this.mtproto.isReady()) {
      return { error: 'MTProto not configured — cannot search Telegram' };
    }

    const limit = Math.min(Math.max(input.limit || 10, 1), 50);
    const results = await this.mtproto.searchPublic(query, limit);

    if (!results) {
      return { error: 'Search failed — try again later' };
    }

    return {
      query,
      count: results.length,
      results,
    };
  }
}
