import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_jetton_info',
  description:
    'look up jetton (token) metadata: name, symbol, decimals, total supply, holder count, verification status by contract address',
  example: { jetton_address: 'EQ...' },
})
export class JettonInfoSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const address: string = input.jetton_address;
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/jettons/${address}`, { headers }),
    );

    const meta = data.metadata || {};
    const decimals = parseInt(meta.decimals || '9', 10);
    const rawSupply = BigInt(data.total_supply || '0');
    const divisor = BigInt(10) ** BigInt(decimals);
    const supplyWhole = rawSupply / divisor;
    const supplyFrac = rawSupply % divisor;
    const totalSupply = Number(supplyWhole) + Number(supplyFrac) / Number(divisor);

    return {
      address,
      name: meta.name || 'Unknown',
      symbol: meta.symbol || 'Unknown',
      decimals,
      totalSupply: formatLargeNumber(totalSupply),
      totalSupplyRaw: totalSupply,
      holdersCount: data.holders_count || 0,
      verification: data.verification || 'unknown',
      description: meta.description || '',
      image: meta.image || null,
    };
  }
}

function formatLargeNumber(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}
