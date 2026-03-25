import { Injectable } from '@nestjs/common';
import { TonPriceSkill } from './ton-price.skill';
import { WalletSkill } from './wallet.skill';
import { NftInfoSkill } from './nft-info.skill';
import { FragmentSkill } from './fragment.skill';

@Injectable()
export class SkillsService {
  constructor(
    private tonPriceSkill: TonPriceSkill,
    private walletSkill: WalletSkill,
    private nftInfoSkill: NftInfoSkill,
    private fragmentSkill: FragmentSkill,
  ) {}

  async dispatch(skillName: string, input: any): Promise<any> {
    try {
      switch (skillName) {
        case 'get_ton_price':
          return this.tonPriceSkill.execute();
        case 'get_wallet_info':
          return this.walletSkill.execute(input.address);
        case 'get_nft_info':
          return this.nftInfoSkill.execute(input.nft_address);
        case 'get_username_price':
          return this.fragmentSkill.execute(input.username);
        default:
          return { error: 'Unknown skill' };
      }
    } catch (error) {
      return { error: 'Could not fetch data', detail: error.message };
    }
  }
}
