import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AgentService } from './agent.service.js';
import { GiftRegistryService } from './gift-registry.service.js';

@Module({
  imports: [HttpModule],
  providers: [AgentService, GiftRegistryService],
  exports: [AgentService],
})
export class AgentModule {}
