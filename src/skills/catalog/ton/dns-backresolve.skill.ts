import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_address_domains',
  description:
    'reverse DNS lookup — find all .ton domains linked to a wallet address',
  example: { address: 'UQ...' },
})
export class DnsBackresolveSkill implements SkillHandler {
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
      this.http.get(
        `https://tonapi.io/v2/accounts/${address}/dns/backresolve`,
        { headers },
      ),
    );

    return {
      address,
      domains: data.domains || [],
    };
  }
}
