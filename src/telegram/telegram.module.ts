import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { TelegramService } from './telegram.service';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule],
  providers: [TelegramUpdate, TelegramService],
})
export class TelegramModule {}
