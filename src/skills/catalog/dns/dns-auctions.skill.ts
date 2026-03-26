import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'dns_auctions',
  description:
    'List active .ton domain auctions with current bids and time remaining',
  example: {},
})
export class DnsAuctionsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(): Promise<any> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get('https://tonapi.io/v2/dns/auctions', {
        headers,
        timeout: 10000,
      }),
    );

    const auctions = (data.data || []).map((a: any) => ({
      domain: a.domain,
      owner: a.owner,
      price: a.price,
      bids: a.bids,
      endTime: a.date,
    }));

    return { count: auctions.length, auctions };
  }
}
