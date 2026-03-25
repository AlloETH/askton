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

  private static scanSkillFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.scanSkillFiles(full));
      } else if (entry.name.endsWith('.skill.js')) {
        results.push(full);
      }
    }
    return results;
  }

  static forRoot(): DynamicModule {
    if (!this.loaded) {
      const skillsDir = path.resolve(__dirname, 'catalog');
      const files = this.scanSkillFiles(skillsDir);

      for (const file of files) {
        try {
          require(file);
        } catch (err) {
          const name = path.relative(skillsDir, file);
          this.logger.error(`Failed to load skill ${name}, skipping: ${err.message}`);
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
