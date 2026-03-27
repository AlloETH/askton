import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'fragment_history',
  description:
    'Get sale/ownership history for a Telegram username or phone number on Fragment. Shows past sales, bids, and transfers. NOT for gifts.',
  example: { type: 'username', item: 'allo' },
})
export class FragmentHistorySkill implements SkillHandler {
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
    const events: any[] = [];

    // Extract tonRate for USD conversion
    let tonRate: number | null = null;
    const rateMatch = body.match(/"tonRate"\s*:\s*([\d.]+)/);
    if (rateMatch) tonRate = parseFloat(rateMatch[1]);

    // Fragment shows ownership history as a table with columns:
    // "Sale price | Date | Buyer"
    const tableMatch = body.match(
      /Sale\s*price[\s\S]*?<\/table>/i,
    );

    if (tableMatch) {
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr: RegExpExecArray | null;
      while ((tr = trRe.exec(tableMatch[0])) !== null && events.length < 20) {
        if (/<th/i.test(tr[1])) continue;

        const cells: string[] = [];
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let td: RegExpExecArray | null;
        while ((td = tdRe.exec(tr[1])) !== null) {
          cells.push(td[1].replace(/<[^>]*>/g, '').trim());
        }
        if (cells.length >= 2) {
          const priceOrAction = cells[0] || '';
          const isTransfer = /transferred/i.test(priceOrAction);
          const priceTon = isTransfer ? null : priceOrAction.replace(/,/g, '') || null;
          events.push({
            action: isTransfer ? 'transfer' : 'sale',
            priceTon,
            priceUsd: priceTon && tonRate
              ? (parseFloat(priceTon) * tonRate).toFixed(2)
              : null,
            date: cells[1] || null,
            buyer: cells[2] || null,
          });
        }
      }
    }

    return {
      type,
      item,
      eventCount: events.length,
      tonRateUsd: tonRate,
      events,
      url,
    };
  }
}
