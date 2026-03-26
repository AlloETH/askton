import { Module } from '@nestjs/common';
import { MtprotoService } from './mtproto.service.js';

@Module({
  providers: [MtprotoService],
  exports: [MtprotoService],
})
export class MtprotoModule {}
