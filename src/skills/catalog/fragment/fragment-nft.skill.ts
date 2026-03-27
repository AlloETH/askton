import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'fragment_nft',
  description:
    'Get NFT metadata for a specific Fragment collectible gift by slug (e.g. "plushpepe-1821") — name, collection, price, owner, rarity.',
  example: { slug: 'plushpepe-1821' },
})
export class FragmentNftSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const slug: string = input.slug;
    if (!slug) return { error: 'Missing slug (e.g. "plushpepe-1821")' };

    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible bot)' };

    const { data: html } = await firstValueFrom(
      this.http.get<string>(
        `https://fragment.com/gift/${encodeURIComponent(slug)}`,
        { headers, responseType: 'text' },
      ),
    );

    const body = typeof html === 'string' ? html : String(html);

    const extract = (pattern: RegExp): string | null => {
      const m = body.match(pattern);
      return m ? m[1].replace(/<[^>]*>/g, '').trim() : null;
    };

    const name =
      extract(/<h1[^>]*>([\s\S]*?)<\/h1>/) ||
      extract(/class="[^"]*gift-title[^"]*"[^>]*>([\s\S]*?)</) ||
      slug;

    const collection = extract(
      /(?:collection|set)[^<]*<[^>]*>([^<]+)/i,
    );

    let priceTon: string | null = null;
    let priceUsd: string | null = null;
    let status = 'unknown';
    let owner: string | null = null;
    let rarity: string | null = null;

    const tonMatch = body.match(/(\d[\d,.]*)\s*TON/i);
    if (tonMatch) priceTon = tonMatch[1].replace(/,/g, '');

    const usdMatch = body.match(/~\s*\$\s*([\d,.]+)/);
    if (usdMatch) priceUsd = usdMatch[1].replace(/,/g, '');

    if (/taken|sold/i.test(body)) status = 'sold';
    else if (/available|buy|purchase/i.test(body)) status = 'available';
    else if (/on\s*sale|resale/i.test(body)) status = 'on_sale';

    const ownerMatch = body.match(
      /(?:owner|owned\s*by|assigned)[^<]*<[^>]*>([^<]+)/i,
    );
    if (ownerMatch) owner = ownerMatch[1].trim();

    const rarityMatch = body.match(
      /(?:rarity|rank)[^<]*<[^>]*>([^<]+)/i,
    );
    if (rarityMatch) rarity = rarityMatch[1].trim();

    // Try to find NFT address
    const nftAddress = extract(
      /(?:nft\s*address|contract)[^<]*<[^>]*>([A-Za-z0-9_-]{48})/i,
    );

    return {
      slug,
      name,
      collection,
      status,
      priceTon,
      priceUsd,
      owner,
      rarity,
      nftAddress,
      url: `https://fragment.com/gift/${slug}`,
      note: 'Scraped from fragment.com — verify on site',
    };
  }
}
