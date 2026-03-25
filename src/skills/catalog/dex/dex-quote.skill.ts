import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

const TON_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

@Skill({
  name: 'get_dex_quote',
  description:
    'compare swap quotes from STON.fi and DeDust DEXes for a token pair. Use "TON" for native TON or a jetton contract address',
  example: { from: 'TON', to: 'EQ...jetton_address', amount: 10 },
})
export class DexQuoteSkill implements SkillHandler {
  constructor(private http: HttpService) {}

  async execute(input: any): Promise<any> {
    const fromToken: string = input.from || 'TON';
    const toToken: string = input.to;
    const amount: number = input.amount || 1;

    if (!toToken) {
      return { error: 'Missing "to" token address' };
    }

    const fromAddr = fromToken.toUpperCase() === 'TON' ? TON_ADDRESS : fromToken;
    const toAddr = toToken.toUpperCase() === 'TON' ? TON_ADDRESS : toToken;

    // Determine decimals (TON = 9, jettons default 9 too)
    const decimals = 9;
    const amountRaw = BigInt(Math.round(amount * 10 ** decimals)).toString();

    const [stonfi, dedust] = await Promise.allSettled([
      this.getStonfiQuote(fromAddr, toAddr, amountRaw),
      this.getDedustQuote(fromAddr, toAddr, amountRaw),
    ]);

    const result: any = {
      from: fromToken,
      to: toToken,
      amount,
    };

    if (stonfi.status === 'fulfilled') {
      result.stonfi = stonfi.value;
    } else {
      result.stonfi = { error: stonfi.reason?.message || 'Quote unavailable' };
    }

    if (dedust.status === 'fulfilled') {
      result.dedust = dedust.value;
    } else {
      result.dedust = { error: dedust.reason?.message || 'Quote unavailable' };
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
  ): Promise<any> {
    const url = `https://api.ston.fi/v1/swap/simulate?offer_address=${fromAddr}&ask_address=${toAddr}&units=${amountRaw}&slippage_tolerance=0.01`;

    const { data } = await firstValueFrom(
      this.http.get(url, { timeout: 10000 }),
    );

    const decimals = 9;
    const expectedOutput =
      Number(BigInt(data.ask_units || '0')) / 10 ** decimals;
    const minOutput =
      Number(BigInt(data.min_ask_units || '0')) / 10 ** decimals;

    return {
      expectedOutput,
      minOutput,
      priceImpact: data.price_impact || null,
      fee: data.fee_units
        ? Number(BigInt(data.fee_units)) / 10 ** decimals
        : null,
    };
  }

  private async getDedustQuote(
    fromAddr: string,
    toAddr: string,
    amountRaw: string,
  ): Promise<any> {
    const url = `https://api.dedust.io/v2/routing/plan?from=${fromAddr}&to=${toAddr}&amount=${amountRaw}`;

    const { data } = await firstValueFrom(
      this.http.get(url, { timeout: 10000 }),
    );

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return { error: 'No route found' };
    }

    const route = Array.isArray(data) ? data[0] : data;
    const decimals = 9;
    const amountOut = route.amountOut || route.amount_out || '0';
    const expectedOutput = Number(BigInt(amountOut)) / 10 ** decimals;

    return {
      expectedOutput,
      priceImpact: route.priceImpact || route.price_impact || null,
    };
  }
}
