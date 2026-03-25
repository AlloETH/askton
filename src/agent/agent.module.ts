import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AgentService } from './agent.service';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [HttpModule, SkillsModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
