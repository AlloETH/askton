import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';
import { resolveUsername } from '../../resolve-username';

@Skill({
  name: 'get_account_subscriptions',
  description:
    'list active on-chain subscriptions (recurring payments) for a TON wallet',
  example: { address: 'UQ...' },
})
export class AccountSubscriptionsSkill implements SkillHandler {
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

    let resolved = address;
    if (address.startsWith('@')) {
      resolved = await resolveUsername(this.http, address.slice(1), headers);
    }

    const { data } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/accounts/${resolved}/subscriptions`, {
        headers,
      }),
    );

    const subscriptions = (data.subscriptions || []).map((s: any) => ({
      address: s.address,
      beneficiary: s.beneficiary_address || null,
      amount: s.amount ? Number(s.amount) / 1e9 : 0,
      period: s.period || null,
      startTime: s.start_time
        ? new Date(s.start_time * 1000).toISOString()
        : null,
      lastPayment: s.last_payment_time
        ? new Date(s.last_payment_time * 1000).toISOString()
        : null,
      failedAttempts: s.failed_attempts || 0,
    }));

    return {
      wallet: resolved,
      count: subscriptions.length,
      subscriptions,
    };
  }
}
