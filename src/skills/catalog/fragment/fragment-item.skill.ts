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
    } else {
      url = `https://fragment.com/username/${item.replace(/^@/, '')}`;
    }

    const { data: html } = await firstValueFrom(
      this.http.get<string>(url, { headers, responseType: 'text', timeout: 15000 }),
    );

    const body = typeof html === 'string' ? html : String(html);

    // Extract tonRate from ajInit JSON for USD conversion
    let tonRate: number | null = null;
    const rateMatch = body.match(/"tonRate"\s*:\s*([\d.]+)/);
    if (rateMatch) tonRate = parseFloat(rateMatch[1]);

    // Status detection — Fragment shows "Sold", "Available", "On Sale" in heading
    let status = 'unknown';
    if (/Sold<|Sold\b/i.test(body)) status = 'sold';
    else if (/Available<|Available\b/i.test(body)) status = 'available';
    else if (/On\s*Sale|For\s*Sale/i.test(body)) status = 'on_sale';
    else if (/not\s*for\s*sale/i.test(body)) status = 'not_for_sale';

    const isAuction = /auction|bid/i.test(body);

    // Sale price — Fragment shows it as a plain number under "Sale Price" or "Price" label
    // Pattern: "Sale Price" ... number, or just a large number near price context
    let priceTon: string | null = null;

    // Try "Sale Price" section — the number follows the label in nearby HTML
    const salePriceMatch = body.match(
      /Sale\s*Price[\s\S]{0,200}?(\d[\d,]*(?:\.\d+)?)/i,
    );
    if (salePriceMatch) {
      priceTon = salePriceMatch[1].replace(/,/g, '');
    }

    // Fallback: number followed by TON
    if (!priceTon) {
      const tonMatch = body.match(/(\d[\d,.]*)\s*TON/i);
      if (tonMatch) priceTon = tonMatch[1].replace(/,/g, '');
    }

    // Stars price
    let priceStars: string | null = null;
    const starsMatch = body.match(/(\d[\d,]*)\s*Stars?/i);
    if (starsMatch) priceStars = starsMatch[1].replace(/,/g, '');

    // USD — Fragment shows "Approximately $1,247"
    let priceUsd: string | null = null;
    const approxMatch = body.match(/Approximately\s*\$\s*([\d,.]+)/i);
    if (approxMatch) {
      priceUsd = approxMatch[1].replace(/,/g, '');
    } else {
      const usdMatch = body.match(/~?\s*\$\s*([\d,.]+)/);
      if (usdMatch) priceUsd = usdMatch[1].replace(/,/g, '');
    }

    // Compute USD from tonRate if we have price but no USD
    if (priceTon && !priceUsd && tonRate) {
      priceUsd = (parseFloat(priceTon) * tonRate).toFixed(2);
    }

    // Owner — look for link near "Owner" label, or after "Purchased"
    let owner: string | null = null;
    const ownerBlock = body.match(
      /Owner[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/i,
    );
    if (ownerBlock) owner = ownerBlock[1].trim();

    // Purchase date
    let purchaseDate: string | null = null;
    const dateMatch = body.match(
      /Purchased\s*on\s*(\d{1,2}\s+\w+\s+\d{4}\s+at\s+\d{1,2}:\d{2})/i,
    );
    if (dateMatch) purchaseDate = dateMatch[1];

    // Ownership history — extract table rows
    const history: any[] = [];
    const tableMatch = body.match(
      /Sale\s*price[\s\S]*?<\/table>/i,
    );
    if (tableMatch) {
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr;
      while ((tr = trRe.exec(tableMatch[0])) !== null && history.length < 20) {
        // Skip header row
        if (/<th/i.test(tr[1])) continue;

        const cells: string[] = [];
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let td;
        while ((td = tdRe.exec(tr[1])) !== null) {
          cells.push(td[1].replace(/<[^>]*>/g, '').trim());
        }
        if (cells.length >= 2) {
          const priceOrAction = cells[0] || null;
          const isTransfer = /transferred/i.test(priceOrAction || '');
          history.push({
            action: isTransfer ? 'transfer' : 'sale',
            priceTon: isTransfer ? null : priceOrAction?.replace(/,/g, '') || null,
            date: cells[1] || null,
            buyer: cells[2] || null,
          });
        }
      }
    }

    return {
      type,
      item,
      status,
      priceTon,
      priceUsd,
      priceStars,
      isAuction,
      owner,
      purchaseDate,
      tonRateUsd: tonRate,
      history: history.length > 0 ? history : undefined,
      url,
    };
  }
}
