import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import {
  SKILL_META_KEY,
  SKILL_CLASSES,
  SkillMeta,
  SkillHandler,
} from './skill.decorator.js';

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);
  private readonly registry = new Map<string, SkillHandler>();
  private readonly metas: SkillMeta[] = [];

  constructor(
    private moduleRef: ModuleRef,
    private reflector: Reflector,
  ) {}

  onModuleInit() {
    for (const skillClass of SKILL_CLASSES) {
      const meta = this.reflector.get<SkillMeta>(SKILL_META_KEY, skillClass);
      if (meta) {
        const instance = this.moduleRef.get<SkillHandler>(skillClass, {
          strict: false,
        });
        this.registry.set(meta.name, instance);
        this.metas.push(meta);
        this.logger.log(`Registered skill: ${meta.name}`);
      }
    }
  }

  getSkillPromptBlock(): string {
    return this.metas
      .map((m) => {
        const example = JSON.stringify({ skill: m.name, input: m.example });
        return `${m.name} — ${m.description}\nExample: ${example}`;
      })
      .join('\n\n');
  }

  async dispatch(
    skillName: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const skill = this.registry.get(skillName);
    if (!skill) {
      return { error: `Unknown skill: ${skillName}` };
    }

    try {
      return (await skill.execute(input)) as Record<string, unknown>;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: 'Could not fetch data', detail: message };
    }
  }
}
