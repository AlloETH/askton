import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_blockchain_stats',
  description:
    'get TON blockchain network stats — latest block, gas config, network parameters',
  example: {},
})
export class BlockchainStatsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(): Promise<any> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const [headRes, configRes, statusRes] = await Promise.all([
      firstValueFrom(
        this.http.get(`https://tonapi.io/v2/blockchain/masterchain-head`, {
          headers,
        }),
      ),
      firstValueFrom(
        this.http.get(`https://tonapi.io/v2/blockchain/config`, { headers }),
      ),
      firstValueFrom(this.http.get(`https://tonapi.io/v2/status`)),
    ]);

    const head = headRes.data;
    const config = configRes.data;

    return {
      latestBlock: {
        seqno: head.seqno,
        workchain: head.workchain_id,
        shard: head.shard,
        timestamp: head.gen_utime
          ? new Date(head.gen_utime * 1000).toISOString()
          : null,
      },
      gasConfig: config['20']
        ? {
            flatGasLimit: config['20'].flat_gas_limit,
            flatGasPrice: config['20'].flat_gas_price,
            gasPrice: config['20'].gas_price,
          }
        : null,
      validatorConfig: config['15']
        ? {
            validatorsElectedFor: config['15'].validators_elected_for,
            electionsStartBefore: config['15'].elections_start_before,
            electionsEndBefore: config['15'].elections_end_before,
            stakeHeldFor: config['15'].stake_held_for,
          }
        : null,
      indexingLatency: statusRes.data?.indexing_latency || null,
    };
  }
}
