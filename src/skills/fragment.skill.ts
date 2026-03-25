import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FragmentSkill {
  constructor(private http: HttpService) {}

  async execute(username: string): Promise<any> {
    const clean = username.replace(/^@/, '');
    const url = `https://fragment.com/username/${clean}`;

    const { data: html } = await firstValueFrom(
      this.http.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible bot)',
        },
        responseType: 'text',
      }),
    );

    const body = typeof html === 'string' ? html : String(html);

    // Try to extract price from page content
    let priceTon: number | null = null;
    let priceStars: number | null = null;
    let available = false;
    let isAuction = false;

    // Look for TON price patterns
    const tonMatch = body.match(/(\d+(?:\.\d+)?)\s*TON/i);
    if (tonMatch) {
      priceTon = parseFloat(tonMatch[1]);
      available = true;
    }

    // Look for Stars price patterns
    const starsMatch = body.match(/(\d+(?:,\d+)*)\s*Stars?/i);
    if (starsMatch) {
      priceStars = parseInt(starsMatch[1].replace(/,/g, ''), 10);
      available = true;
    }

    // Check for auction
    if (/auction|bid/i.test(body)) {
      isAuction = true;
    }

    // Check availability
    if (/taken|sold|unavailable/i.test(body) && !priceTon && !priceStars) {
      available = false;
    } else if (/available|buy|purchase/i.test(body)) {
      available = true;
    }

    return {
      username: clean,
      available,
      priceTon,
      priceStars,
      isAuction,
      note: 'scraped data, verify on fragment.com',
    };
  }
}
