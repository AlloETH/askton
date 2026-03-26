import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveUsername } from '../../resolve-username.js';

@Skill({
  name: 'get_jetton_transfers',
  description:
    'get recent jetton (token) transfer history for a wallet — shows all token sends/receives with amounts',
  example: { address: 'UQ... or @username', limit: 10 },
})
export class JettonTransferHistorySkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.address;
    const limit = Math.min(Math.max(input.limit || 10, 1), 50);
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    let resolved = address;
    if (address.startsWith('@')) {
      resolved = await resolveUsername(this.http, address.slice(1), headers);
    }

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/accounts/${resolved}/jettons/history?limit=${limit}`,
        { headers },
      ),
    );

    const events = (data.events || []).map((e: any) => {
      const actions = (e.actions || [])
        .filter((a: any) => a.JettonTransfer)
        .map((a: any) => {
          const t = a.JettonTransfer;
          const decimals = parseInt(t.jetton?.decimals || '9', 10);
          const amount = Number(BigInt(t.amount || '0')) / 10 ** decimals;
          return {
            symbol: t.jetton?.symbol || 'Unknown',
            name: t.jetton?.name || null,
            amount,
            sender: t.sender?.address || null,
            recipient: t.recipient?.address || null,
            jettonAddress: t.jetton?.address || null,
          };
        });

      return {
        timestamp: e.timestamp
          ? new Date(e.timestamp * 1000).toISOString()
          : null,
        fee: e.fee ? Number(e.fee) / 1e9 : null,
        transfers: actions,
      };
    });

    return {
      wallet: resolved,
      count: events.length,
      events,
    };
  }
}
