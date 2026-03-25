import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TonPriceSkill {
  constructor(private http: HttpService) {}

  async execute(): Promise<any> {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd,eur,btc';

    const { data } = await firstValueFrom(this.http.get(url));
    const ton = data['the-open-network'];

    return {
      usd: ton.usd,
      eur: ton.eur,
      btc: ton.btc,
    };
  }
}
