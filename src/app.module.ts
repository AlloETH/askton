import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import configuration from './config/configuration';
import { TelegramModule } from './telegram/telegram.module';
import { AgentModule } from './agent/agent.module';
import { SkillsModule } from './skills/skills.module';

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
    SkillsModule,
  ],
})
export class AppModule {}
