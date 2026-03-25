import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

const PERIOD_CONFIG: Record<string, { seconds: number; points: number }> = {
  '1h': { seconds: 3600, points: 60 },
  '24h': { seconds: 86400, points: 96 },
  '7d': { seconds: 604800, points: 168 },
  '30d': { seconds: 2592000, points: 120 },
  '90d': { seconds: 7776000, points: 90 },
  '1y': { seconds: 31536000, points: 365 },
};

@Skill({
  name: 'get_ton_chart',
  description:
    'get price chart data for TON or any jetton over a time period (1h, 24h, 7d, 30d, 90d, 1y)',
  example: { token: 'ton', period: '7d' },
})
export class TonChartSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const token: string = input.token || 'ton';
    const period: string = input.period || '7d';
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const config = PERIOD_CONFIG[period];
    if (!config) {
      return {
        error: `Invalid period "${period}". Use: ${Object.keys(PERIOD_CONFIG).join(', ')}`,
      };
    }

    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - config.seconds;

    const tokenParam =
      token.toLowerCase() === 'ton'
        ? 'ton'
        : token;

    const { data } = await firstValueFrom(
      this.http.get(
        `https://tonapi.io/v2/rates/chart?token=${tokenParam}&currency=usd&start_date=${startTime}&end_date=${endTime}&points_count=${config.points}`,
        { headers },
      ),
    );

    const points = (data.points || [])
      .map((p: any) => ({
        timestamp: p[0],
        date: new Date(p[0] * 1000).toISOString(),
        price: p[1],
      }))
      .sort((a: any, b: any) => a.timestamp - b.timestamp);

    if (points.length === 0) {
      return { error: 'No price data available for this token/period' };
    }

    const prices = points.map((p: any) => p.price);
    const currentPrice = prices[prices.length - 1];
    const startPrice = prices[0];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const change = currentPrice - startPrice;
    const changePercent = ((change / startPrice) * 100).toFixed(2);

    return {
      token: tokenParam,
      period,
      currentPrice,
      startPrice,
      minPrice,
      maxPrice,
      change,
      changePercent: changePercent + '%',
      dataPoints: points.length,
      points,
    };
  }
}
