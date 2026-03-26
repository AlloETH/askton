import { DynamicModule, Logger, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SkillsService } from './skills.service.js';
import { SKILL_CLASSES } from './skill.decorator.js';
import { MtprotoModule } from '../telegram/mtproto.module.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  static async forRoot(): Promise<DynamicModule> {
    if (!this.loaded) {
      const skillsDir = path.resolve(__dirname, 'catalog');
      const files = this.scanSkillFiles(skillsDir);

      for (const file of files) {
        try {
          await import(pathToFileURL(file).href);
        } catch (err: unknown) {
          const name = path.relative(skillsDir, file);
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to load skill ${name}, skipping: ${message}`,
          );
        }
      }

      this.loaded = true;
      this.logger.log(
        `Loaded ${SKILL_CLASSES.length} skills from ${files.length} files`,
      );
    }

    return {
      module: SkillsModule,
      imports: [HttpModule, MtprotoModule],
      providers: [
        SkillsService,
        ...(SKILL_CLASSES as Array<new (...args: unknown[]) => unknown>),
      ],
      exports: [SkillsService],
      global: true,
    };
  }
}
