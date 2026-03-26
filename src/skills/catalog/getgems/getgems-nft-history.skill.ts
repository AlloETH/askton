import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'getgems_nft_history',
  description:
    'Get transaction history for an NFT on GetGems — sales, transfers, listings. Use NFT contract address.',
  example: { nft_address: 'EQ...' },
})
export class GetGemsNftHistorySkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('getgemsApiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.nft_address;
    if (!address) return { error: 'Missing nft_address' };

    const limit: number = input.limit || 20;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://api.getgems.io/public-api/v1/nft/history/${address}?limit=${limit}`,
        { headers: { Authorization: this.apiKey } },
      ),
    );

    const events = (data.items || data.historyItems || []).map((e: any) => ({
      type: e.type,
      time: e.time,
      price: e.price,
      currency: e.currency,
      from: e.fromAddress || e.seller,
      to: e.toAddress || e.buyer,
    }));

    return { nft: address, events };
  }
}
