import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import {
  resolveJetton,
  toUnits,
  fromUnits,
  getDecimals,
} from '../../resolve-jetton.js';

const TON_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

@Skill({
  name: 'get_dex_quote',
  description:
    'Compare swap quotes from STON.fi and DeDust DEXes. Accepts token names ($DOGS), symbols, or contract addresses. Use "TON" for native TON.',
  example: { from: 'TON', to: 'DOGS', amount: 10 },
})
export class DexQuoteSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const fromToken: string = input.from || 'TON';
    const toToken: string = input.to;
    const amount: number = input.amount || 1;

    if (!toToken) {
      return { error: 'Missing "to" token' };
    }

    // Resolve both tokens
    const fromResolved = await resolveJetton(
      this.http,
      fromToken,
      this.apiKey,
    );
    const toResolved = await resolveJetton(this.http, toToken, this.apiKey);

    if (!fromResolved) return { error: `Token "${fromToken}" not found` };
    if (!toResolved) return { error: `Token "${toToken}" not found` };

    const fromAddr =
      fromToken.toUpperCase() === 'TON'
        ? TON_ADDRESS
        : fromResolved.address;
    const toAddr =
      toToken.toUpperCase() === 'TON'
        ? TON_ADDRESS
        : toResolved.address;

    // Get correct decimals for input token
    const fromDecimals =
      fromResolved.decimals ??
      (await getDecimals(this.http, fromToken));
    const toDecimals =
      toResolved.decimals ??
      (await getDecimals(this.http, toToken));

    const amountRaw = toUnits(amount, fromDecimals).toString();

    const [stonfi, dedust] = await Promise.allSettled([
      this.getStonfiQuote(fromAddr, toAddr, amountRaw, toDecimals),
      this.getDedustQuote(fromAddr, toAddr, amountRaw, toDecimals),
    ]);

    const result: any = {
      from: fromToken,
      fromAddress: fromAddr,
      to: toToken,
      toAddress: toAddr,
      amount,
    };

    if (stonfi.status === 'fulfilled') {
      result.stonfi = stonfi.value;
    } else {
      result.stonfi = {
        error: stonfi.reason?.message || 'Quote unavailable',
      };
    }

    if (dedust.status === 'fulfilled') {
      result.dedust = dedust.value;
    } else {
      result.dedust = {
        error: dedust.reason?.message || 'Quote unavailable',
      };
    }

    // Determine best
    const stonfiOut = result.stonfi?.expectedOutput || 0;
    const dedustOut = result.dedust?.expectedOutput || 0;

    if (stonfiOut > 0 && dedustOut > 0) {
      result.recommended = stonfiOut >= dedustOut ? 'STON.fi' : 'DeDust';
      const diff = Math.abs(stonfiOut - dedustOut);
      const better = Math.max(stonfiOut, dedustOut);
      result.savingsPercent = ((diff / better) * 100).toFixed(2) + '%';
    } else if (stonfiOut > 0) {
      result.recommended = 'STON.fi';
    } else if (dedustOut > 0) {
      result.recommended = 'DeDust';
    }

    return result;
  }

  private async getStonfiQuote(
    fromAddr: string,
    toAddr: string,
    amountRaw: string,
    toDecimals: number,
  ): Promise<any> {
    const url = `https://api.ston.fi/v1/swap/simulate?offer_address=${fromAddr}&ask_address=${toAddr}&units=${amountRaw}&slippage_tolerance=0.01`;

    const { data } = await firstValueFrom(
      this.http.get(url, { timeout: 10000 }),
    );

    const expectedOutput = fromUnits(
      BigInt(data.ask_units || '0'),
      toDecimals,
    );
    const minOutput = fromUnits(
      BigInt(data.min_ask_units || '0'),
      toDecimals,
    );

    return {
      expectedOutput,
      minOutput,
      priceImpact: data.price_impact || null,
      fee: data.fee_units
        ? fromUnits(BigInt(data.fee_units), toDecimals)
        : null,
    };
  }

  private async getDedustQuote(
    fromAddr: string,
    toAddr: string,
    amountRaw: string,
    toDecimals: number,
  ): Promise<any> {
    const url = `https://api.dedust.io/v2/routing/plan?from=${fromAddr}&to=${toAddr}&amount=${amountRaw}`;

    const { data } = await firstValueFrom(
      this.http.get(url, { timeout: 10000 }),
    );

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return { error: 'No route found' };
    }

    const route = Array.isArray(data) ? data[0] : data;
    const amountOut = route.amountOut || route.amount_out || '0';
    const expectedOutput = fromUnits(BigInt(amountOut), toDecimals);

    return {
      expectedOutput,
      priceImpact: route.priceImpact || route.price_impact || null,
    };
  }
}
