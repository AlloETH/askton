import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SkillsService } from './skills.service';
import { TonPriceSkill } from './ton-price.skill';
import { WalletSkill } from './wallet.skill';
import { NftInfoSkill } from './nft-info.skill';
import { FragmentSkill } from './fragment.skill';

@Module({
  imports: [HttpModule],
  providers: [SkillsService, TonPriceSkill, WalletSkill, NftInfoSkill, FragmentSkill],
  exports: [SkillsService],
})
export class SkillsModule {}
