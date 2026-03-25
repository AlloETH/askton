import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_multisig_info',
  description:
    'get info about a TON multisig wallet — signers, threshold, pending orders',
  example: { address: 'EQ...' },
})
export class MultisigInfoSkill implements SkillHandler {
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
      this.http.get(`https://tonapi.io/v2/multisig/${address}`, { headers }),
    );

    return {
      address,
      signers: data.signers || [],
      threshold: data.threshold || null,
      proposers: data.proposers || [],
      orders: (data.orders || []).map((o: any) => ({
        address: o.address,
        orderSeqno: o.order_seqno,
        threshold: o.threshold,
        sentForExecution: o.sent_for_execution || false,
        signers: o.signers || [],
        approvalsNum: o.approvals_num || 0,
        expiresAt: o.expiration_date
          ? new Date(o.expiration_date * 1000).toISOString()
          : null,
      })),
    };
  }
}
