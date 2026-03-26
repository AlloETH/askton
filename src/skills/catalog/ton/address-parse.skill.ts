import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'parse_ton_address',
  description:
    'convert a TON address between formats — shows raw, bounceable, non-bounceable, and test-only variants',
  example: { address: 'UQ...' },
})
export class AddressParseSkill implements SkillHandler {
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
      this.http.get(`https://tonapi.io/v2/address/${address}/parse`, {
        headers,
      }),
    );

    return {
      rawForm: data.raw_form || null,
      bounceable: data.bounceable?.b64 || null,
      nonBounceable: data.non_bounceable?.b64 || null,
      givenType: data.given_type || null,
      testOnly: data.test_only || false,
    };
  }
}
