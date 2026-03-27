import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'fragment_item',
  description:
    'Get detailed info for a Telegram username or phone number on Fragment — price, status, owner. NOT for gifts.',
  example: { type: 'username', item: 'allo' },
})
export class FragmentItemSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const item: string = input.item;
    if (!item) return { error: 'Missing item' };

    const type: string = input.type || 'username';
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible bot)' };

    let url: string;
    if (type === 'number') {
      url = `https://fragment.com/number/${item.replace(/[^0-9]/g, '')}`;
    } else if (type === 'gift') {
      url = `https://fragment.com/gift/${encodeURIComponent(item)}`;
    } else {
      url = `https://fragment.com/username/${item.replace(/^@/, '')}`;
    }

    const { data: html } = await firstValueFrom(
      this.http.get<string>(url, { headers, responseType: 'text' }),
    );

    const body = typeof html === 'string' ? html : String(html);

    let priceTon: string | null = null;
    let priceStars: string | null = null;
    let priceUsd: string | null = null;
    let status = 'unknown';
    let isAuction = false;
    let owner: string | null = null;

    const tonMatch = body.match(/(\d[\d,.]*)\s*TON/i);
    if (tonMatch) priceTon = tonMatch[1].replace(/,/g, '');

    const starsMatch = body.match(/(\d[\d,]*)\s*Stars?/i);
    if (starsMatch) priceStars = starsMatch[1].replace(/,/g, '');

    const usdMatch = body.match(/~\s*\$\s*([\d,.]+)/);
    if (usdMatch) priceUsd = usdMatch[1].replace(/,/g, '');

    if (/auction|bid/i.test(body)) isAuction = true;

    if (/taken|sold|unavailable/i.test(body)) status = 'sold';
    else if (/available|buy|purchase/i.test(body)) status = 'available';
    else if (/on\s*sale|resale/i.test(body)) status = 'on_sale';

    const ownerMatch = body.match(
      /(?:owner|owned\s*by|assigned\s*to)[^<]*<[^>]*>([^<]+)/i,
    );
    if (ownerMatch) owner = ownerMatch[1].trim();

    return {
      type,
      item,
      status,
      priceTon,
      priceStars,
      priceUsd,
      isAuction,
      owner,
      url,
      note: 'Scraped from fragment.com — verify on site',
    };
  }
}
