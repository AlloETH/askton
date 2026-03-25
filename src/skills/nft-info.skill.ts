import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class NftInfoSkill {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(nftAddress: string): Promise<any> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };

    const { data } = await firstValueFrom(
      this.http.get(`https://tonapi.io/v2/nfts/${nftAddress}`, { headers }),
    );

    return {
      address: nftAddress,
      name: data.metadata?.name || 'Unknown',
      description: data.metadata?.description || '',
      collection: data.collection?.name || 'Unknown',
      collectionAddress: data.collection?.address || null,
      attributes: data.metadata?.attributes || [],
      imageUrl: data.metadata?.image || null,
      owner: data.owner?.address || 'Unknown',
    };
  }
}
