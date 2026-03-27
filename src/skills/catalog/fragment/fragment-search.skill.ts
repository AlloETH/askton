import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'fragment_search',
  description:
    'Search Telegram usernames or phone numbers for sale on Fragment marketplace. Specify type: username or number. NOT for gifts — use gift skills instead.',
  example: { query: 'crypto', type: 'username' },
})
export class FragmentSearchSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const query: string = input.query;
    if (!query) return { error: 'Missing query' };

    const type: string = input.type || 'username';
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible bot)' };

    let url: string;
    if (type === 'number') {
      url = `https://fragment.com/numbers?query=${encodeURIComponent(query)}`;
    } else if (type === 'gift') {
      url = `https://fragment.com/gifts?query=${encodeURIComponent(query)}`;
    } else {
      url = `https://fragment.com/?query=${encodeURIComponent(query)}`;
    }

    const { data: html } = await firstValueFrom(
      this.http.get<string>(url, { headers, responseType: 'text' }),
    );

    const body = typeof html === 'string' ? html : String(html);
    const items: any[] = [];

    if (type === 'number') {
      const re =
        /href="\/number\/(\d+)"[\s\S]*?class="[^"]*table-cell-value[^"]*"[^>]*>([^<]*)<[\s\S]*?(\d[\d,.]*)\s*(?:TON)?/gi;
      let m;
      while ((m = re.exec(body)) !== null && items.length < 15) {
        items.push({
          number: m[1],
          label: m[2].trim(),
          price: m[3].trim(),
        });
      }
    } else if (type === 'gift') {
      const re =
        /href="\/gift\/([^"]+)"[\s\S]*?class="[^"]*table-cell-value[^"]*"[^>]*>([^<]*)</gi;
      let m;
      while ((m = re.exec(body)) !== null && items.length < 15) {
        items.push({
          slug: m[1],
          name: m[2].trim(),
        });
      }
    } else {
      const re =
        /href="\/username\/([^"]+)"[\s\S]*?class="[^"]*table-cell-value[^"]*"[^>]*>@([^<]*)<[\s\S]*?(\d[\d,.]*)\s*(?:TON)?/gi;
      let m;
      while ((m = re.exec(body)) !== null && items.length < 15) {
        items.push({
          username: m[2].trim(),
          price: m[3].trim(),
        });
      }
    }

    return {
      query,
      type,
      count: items.length,
      items,
      note: 'Scraped from fragment.com — verify on site',
    };
  }
}
