import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_validators',
  description:
    'get current TON network validator info — total staked, validator count, election cycle details',
  example: {},
})
export class ValidatorsSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(): Promise<any> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/blockchain/validators`, { headers }),
    );

    const validators = (data.validators || []).map((v: any) => ({
      address: v.address,
      stake: v.stake ? Number(v.stake) / 1e9 : 0,
      maxFactor: v.max_factor || null,
      adnlAddress: v.adnl_addr || null,
    }));

    const totalStake = validators.reduce(
      (sum: number, v: any) => sum + v.stake,
      0,
    );

    return {
      electAt: data.elect_at || null,
      electClose: data.elect_close || null,
      minStake: data.min_stake ? Number(data.min_stake) / 1e9 : null,
      totalStake,
      validatorCount: validators.length,
      topValidators: validators
        .sort((a: any, b: any) => b.stake - a.stake)
        .slice(0, 20),
    };
  }
}
