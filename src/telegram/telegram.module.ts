import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update.js';
import { TelegramService } from './telegram.service.js';
import { MtprotoModule } from './mtproto.module.js';
import { AgentModule } from '../agent/agent.module.js';

@Module({
  imports: [AgentModule, MtprotoModule],
  providers: [TelegramUpdate, TelegramService],
})
export class TelegramModule {}
