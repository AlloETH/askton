import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_sticker_set',
  description:
    'get info about a Telegram sticker set by name — sticker count, type, and preview',
  example: { name: 'Animals' },
})
export class StickerSetSkill implements SkillHandler {
  private token: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.token = this.config.get<string>('telegramToken')!;
  }

  async execute(input: any): Promise<any> {
    const name: string = input.name;
    if (!name) return { error: 'Missing sticker set name' };

    const { data } = await firstValueFrom(
      this.http.get(`https://api.telegram.org/bot${this.token}/getStickerSet`, {
        params: { name },
        timeout: 10000,
      }),
    );

    if (!data?.ok) {
      return { error: data?.description || 'Sticker set not found' };
    }

    const s = data.result;

    return {
      name: s.name,
      title: s.title,
      stickerType: s.sticker_type,
      stickerCount: s.stickers?.length || 0,
      isAnimated: s.stickers?.[0]?.is_animated || false,
      isVideo: s.stickers?.[0]?.is_video || false,
    };
  }
}
