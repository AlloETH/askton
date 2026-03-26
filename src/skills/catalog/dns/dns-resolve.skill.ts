import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'dns_resolve',
  description:
    'Resolve a .ton or .t.me domain to its linked TON wallet address',
  example: { domain: 'foundation.ton' },
})
export class DnsResolveSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const domain: string = input.domain;
    if (!domain) return { error: 'Missing domain' };

    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/dns/${encodeURIComponent(domain)}/resolve`,
        { headers, timeout: 10000 },
      ),
    );

    return {
      domain,
      wallet: data.wallet?.address || null,
      site: data.site || null,
      storage: data.storage || null,
      nextResolver: data.next_resolver || null,
    };
  }
}
