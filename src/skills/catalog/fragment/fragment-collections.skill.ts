import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'fragment_collections',
  description:
    'List gift collections available on Fragment marketplace with item counts.',
  example: {},
})
export class FragmentCollectionsSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(): Promise<any> {
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible bot)' };

    const { data: html } = await firstValueFrom(
      this.http.get<string>('https://fragment.com/gifts', {
        headers,
        responseType: 'text',
      }),
    );

    const body = typeof html === 'string' ? html : String(html);
    const collections: any[] = [];

    const re =
      /href="\/gift\/([^"]+)"[\s\S]*?class="[^"]*table-cell-value[^"]*"[^>]*>([^<]+)<[\s\S]*?(\d[\d,]*)\s*items?/gi;
    let m;
    while ((m = re.exec(body)) !== null && collections.length < 30) {
      collections.push({
        slug: m[1],
        name: m[2].trim(),
        itemCount: parseInt(m[3].replace(/,/g, ''), 10),
      });
    }

    const totalMatch = body.match(/([\d,]+)\s*(?:total\s*)?items/i);

    return {
      totalItems: totalMatch
        ? parseInt(totalMatch[1].replace(/,/g, ''), 10)
        : null,
      count: collections.length,
      collections,
      note: 'Scraped from fragment.com — verify on site',
    };
  }
}
