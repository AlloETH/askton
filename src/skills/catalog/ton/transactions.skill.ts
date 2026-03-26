import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';
import { resolveUsername } from '../../resolve-username';

@Skill({
  name: 'get_transactions',
  description:
    'fetch recent transaction history for a TON wallet address or @username',
  example: { address: 'UQ... or @username', limit: 10 },
})
export class TransactionsSkill implements SkillHandler {
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
        `https://tonapi.io/v2/accounts/${resolved}/events?limit=${limit}`,
        { headers },
      ),
    );

    const events = (data.events || []).map((e: any) => {
      const actions = (e.actions || []).map((a: any) => {
        const result: any = {
          type: a.type,
          status: a.status,
        };

        if (a.TonTransfer) {
          result.amount = Number(a.TonTransfer.amount) / 1e9;
          result.currency = 'TON';
          result.sender = a.TonTransfer.sender?.address || null;
          result.recipient = a.TonTransfer.recipient?.address || null;
          result.comment = a.TonTransfer.comment || null;
        }

        if (a.JettonTransfer) {
          const jt = a.JettonTransfer;
          const decimals = parseInt(jt.jetton?.decimals || '9', 10);
          result.amount = Number(BigInt(jt.amount || '0')) / 10 ** decimals;
          result.currency = jt.jetton?.symbol || 'JETTON';
          result.sender = jt.sender?.address || null;
          result.recipient = jt.recipient?.address || null;
        }

        if (a.NftItemTransfer) {
          result.nftAddress = a.NftItemTransfer.nft || null;
          result.sender = a.NftItemTransfer.sender?.address || null;
          result.recipient = a.NftItemTransfer.recipient?.address || null;
        }

        return result;
      });

      return {
        timestamp: e.timestamp
          ? new Date(e.timestamp * 1000).toISOString()
          : null,
        fee: e.fee ? Number(e.fee) / 1e9 : null,
        actions,
      };
    });

    return {
      wallet: resolved,
      count: events.length,
      transactions: events,
    };
  }
}
