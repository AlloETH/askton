import { Injectable, SetMetadata } from '@nestjs/common';

export const SKILL_META_KEY = 'SKILL_META';

export interface SkillMeta {
  name: string;
  description: string;
  example: Record<string, any>;
}

export interface SkillHandler {
  execute(input: any): Promise<any>;
}

// Global auto-registry — skills add themselves here via the decorator
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const SKILL_CLASSES: Function[] = [];

export function Skill(meta: SkillMeta): ClassDecorator {
  return (target) => {
    SetMetadata(SKILL_META_KEY, meta)(target);
    Injectable()(target);
    SKILL_CLASSES.push(target);
  };
}
