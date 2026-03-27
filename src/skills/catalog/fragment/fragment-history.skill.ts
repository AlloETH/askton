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
    } else if (type === 'gift') {
      url = `https://fragment.com/gift/${encodeURIComponent(item)}`;
    } else {
      url = `https://fragment.com/username/${item.replace(/^@/, '')}`;
    }

    const { data: html } = await firstValueFrom(
      this.http.get<string>(url, { headers, responseType: 'text' }),
    );

    const body = typeof html === 'string' ? html : String(html);
    const events: any[] = [];

    // Match history table rows — common Fragment pattern
    const rowRe =
      /class="[^"]*tm-section-history[^"]*"[\s\S]*?(<tr[\s\S]*?<\/tr>)/gi;
    const historyBlock = body.match(
      /(?:history|activity|transactions?)[\s\S]*?<table[\s\S]*?<\/table>/i,
    );

    if (historyBlock) {
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr;
      while ((tr = trRe.exec(historyBlock[0])) !== null && events.length < 20) {
        const cells: string[] = [];
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let td;
        while ((td = tdRe.exec(tr[1])) !== null) {
          cells.push(td[1].replace(/<[^>]*>/g, '').trim());
        }
        if (cells.length >= 2) {
          events.push({
            action: cells[0],
            detail: cells[1],
            price: cells[2] || null,
            date: cells[3] || cells[2] || null,
          });
        }
      }
    }

    // Fallback: extract any sale/transfer mentions
    if (events.length === 0) {
      const saleRe =
        /(?:sold|transferred|assigned|purchased)[\s\S]{0,100}?(\d[\d,.]*)\s*TON/gi;
      let s;
      while ((s = saleRe.exec(body)) !== null && events.length < 10) {
        events.push({
          action: s[0].substring(0, 50).replace(/<[^>]*>/g, '').trim(),
          price: s[1],
        });
      }
    }

    return {
      type,
      item,
      eventCount: events.length,
      events,
      note: 'Scraped from fragment.com — verify on site',
    };
  }
}
