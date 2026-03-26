import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { TelegramService } from './telegram.service';
import { MtprotoModule } from './mtproto.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule, MtprotoModule],
  providers: [TelegramUpdate, TelegramService],
})
export class TelegramModule {}
