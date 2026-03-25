import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_expiring_domains',
  description:
    'list .ton domains that are expiring soon for a wallet — useful to avoid losing domains',
  example: { address: 'UQ...' },
})
export class DnsExpiringSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.address;
    if (!address) return { error: 'Missing address' };

    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/accounts/${address}/dns/expiring`, {
        headers,
      }),
    );

    const domains = (data.items || []).map((d: any) => ({
      name: d.name || null,
      expiresAt: d.expiring_at
        ? new Date(d.expiring_at * 1000).toISOString()
        : null,
      daysLeft: d.expiring_at
        ? Math.max(
            0,
            Math.floor((d.expiring_at * 1000 - Date.now()) / 86400000),
          )
        : null,
      nftAddress: d.dns_item?.address || null,
    }));

    return {
      address,
      count: domains.length,
      domains,
    };
  }
}
