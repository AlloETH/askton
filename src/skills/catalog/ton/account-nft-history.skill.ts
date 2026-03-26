import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { resolveUsername } from '../../resolve-username.js';

@Skill({
  name: 'get_nft_transfers',
  description:
    'get recent NFT transfer history for a wallet — shows sent/received NFTs with timestamps',
  example: { address: 'UQ... or @username', limit: 10 },
})
export class AccountNftHistorySkill implements SkillHandler {
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
        `https://tonapi.io/v2/accounts/${resolved}/nfts/history?limit=${limit}`,
        { headers },
      ),
    );

    const events = (data.events || []).map((e: any) => {
      const actions = (e.actions || [])
        .filter((a: any) => a.NftItemTransfer)
        .map((a: any) => {
          const t = a.NftItemTransfer;
          return {
            nft: t.nft || null,
            sender: t.sender?.address || null,
            recipient: t.recipient?.address || null,
            comment: t.comment || null,
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
