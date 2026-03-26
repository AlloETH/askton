import { Module } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { GiftRegistryService } from './gift-registry.service.js';

@Module({
  providers: [AgentService, GiftRegistryService],
  exports: [AgentService],
})
export class AgentModule {}
