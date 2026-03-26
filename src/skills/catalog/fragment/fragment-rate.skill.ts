import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'fragment_rate',
  description:
    'Get the current TON/USD exchange rate as shown on Fragment marketplace.',
  example: {},
})
export class FragmentRateSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(): Promise<any> {
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible bot)' };

    const { data: html } = await firstValueFrom(
      this.http.get<string>('https://fragment.com/?sort=price_asc', {
        headers,
        responseType: 'text',
      }),
    );

    const body = typeof html === 'string' ? html : String(html);

    // Find a listing with both TON and USD price to derive the rate
    const tonMatch = body.match(
      /(\d[\d,.]*)\s*TON[\s\S]*?~\s*\$\s*([\d,.]+)/i,
    );

    if (!tonMatch) {
      return { error: 'Could not extract TON/USD rate from Fragment' };
    }

    const ton = parseFloat(tonMatch[1].replace(/,/g, ''));
    const usd = parseFloat(tonMatch[2].replace(/,/g, ''));

    if (!ton || !usd) {
      return { error: 'Could not parse price values' };
    }

    const rate = usd / ton;

    return {
      tonUsd: Math.round(rate * 100) / 100,
      source: 'fragment.com',
      note: 'Derived from listing prices — approximate rate',
    };
  }
}
