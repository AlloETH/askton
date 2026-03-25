import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../skill.decorator';

@Skill({
  name: 'get_nft_info',
  description: 'metadata and collection info for a TON NFT by address',
  example: { nft_address: 'EQ...' },
})
export class NftInfoSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tonapiKey')!;
  }

  async execute(input: any): Promise<any> {
    const nftAddress: string = input.nft_address;
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
