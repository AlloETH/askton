import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_username_price',
  description: 'Fragment marketplace price for a Telegram username',
  example: { username: 'allo' },
})
export class FragmentSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: Record<string, string>): Promise<any> {
    const username = (input.username || '').replace(/^@/, '');
    const url = `https://fragment.com/username/${username}`;

    const { data: html } = await firstValueFrom(
      this.http.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible bot)' },
        responseType: 'text',
      }),
    );

    const body = typeof html === 'string' ? html : String(html);

    let priceTon: number | null = null;
    let priceStars: number | null = null;
    let available = false;
    let isAuction = false;

    const tonMatch = body.match(/(\d+(?:\.\d+)?)\s*TON/i);
    if (tonMatch) {
      priceTon = parseFloat(tonMatch[1]);
      available = true;
    }

    const starsMatch = body.match(/(\d+(?:,\d+)*)\s*Stars?/i);
    if (starsMatch) {
      priceStars = parseInt(starsMatch[1].replace(/,/g, ''), 10);
      available = true;
    }

    if (/auction|bid/i.test(body)) isAuction = true;

    if (/taken|sold|unavailable/i.test(body) && !priceTon && !priceStars) {
      available = false;
    } else if (/available|buy|purchase/i.test(body)) {
      available = true;
    }

    return {
      username,
      available,
      priceTon,
      priceStars,
      isAuction,
      note: 'scraped data, verify on fragment.com',
    };
  }
}
