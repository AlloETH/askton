import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import configuration from './config/configuration.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { AgentModule } from './agent/agent.module.js';
import { SkillsModule } from './skills/skills.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('telegramToken')!,
      }),
    }),
    TelegramModule,
    AgentModule,
    SkillsModule.forRoot(),
  ],
})
export class AppModule {}
