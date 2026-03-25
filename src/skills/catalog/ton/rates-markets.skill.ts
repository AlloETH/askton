import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_token_markets',
  description:
    'get market data for TON or a jetton — prices across exchanges and trading pairs',
  example: { token: 'ton' },
})
export class RatesMarketsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const token: string = input.token || 'ton';
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/rates/markets?token=${token}`,
        { headers },
      ),
    );

    const markets = (data.markets || []).map((m: any) => ({
      name: m.name || null,
      url: m.url || null,
      priceUsd: m.price_usd || null,
      volume24h: m.volume_24h || null,
    }));

    return {
      token,
      marketCount: markets.length,
      markets,
    };
  }
}
