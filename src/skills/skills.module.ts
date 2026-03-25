import { DynamicModule, Logger, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SkillsService } from './skills.service';
import { SKILL_CLASSES } from './skill.decorator';
import * as fs from 'fs';
import * as path from 'path';

@Module({})
export class SkillsModule {
  private static readonly logger = new Logger('SkillsModule');
  private static loaded = false;

  static forRoot(): DynamicModule {
    if (!this.loaded) {
      const skillsDir = path.resolve(__dirname, 'catalog');
      const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.skill.js'));

      for (const file of files) {
        try {
          require(path.resolve(skillsDir, file));
        } catch (err) {
          this.logger.error(`Failed to load skill ${file}, skipping: ${err.message}`);
        }
      }

      this.loaded = true;
      this.logger.log(`Loaded ${SKILL_CLASSES.length} skills from ${files.length} files`);
    }

    return {
      module: SkillsModule,
      imports: [HttpModule],
      providers: [SkillsService, ...(SKILL_CLASSES as any[])],
      exports: [SkillsService],
      global: true,
    };
  }
}
