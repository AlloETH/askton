import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';
import { MtprotoService } from '../../../telegram/mtproto.service.js';

@Skill({
  name: 'check_telegram_username',
  description:
    'check if a Telegram @username is taken — shows profile info if it exists, or confirms it is available',
  example: { username: 'durov' },
})
export class UsernameCheckSkill implements SkillHandler {
  constructor(
    private http: HttpService,
    private mtproto: MtprotoService,
  ) {}

  async execute(input: any): Promise<any> {
    const username: string = (input.username || '').replace(/^@/, '').trim();
    if (!username) return { error: 'Missing username' };

    if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
      return {
        username,
        valid: false,
        error:
          'Invalid username format — must be 5-32 characters, letters/numbers/underscores only',
      };
    }

    // Try MTProto first — definitive answer
    if (this.mtproto.isReady()) {
      const result = await this.mtproto.checkUsername(username);
      if (result) return result;
    }

    // Fallback: scrape t.me profile page
    try {
      const { data: html } = await firstValueFrom(
        this.http.get<string>(`https://t.me/${username}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible bot)' },
          responseType: 'text',
          timeout: 10000,
        }),
      );

      const body = typeof html === 'string' ? html : String(html);

      const nameMatch = body.match(
        /<div class="tgme_page_title">\s*<span[^>]*>(.*?)<\/span>/s,
      );
      const descMatch = body.match(
        /<div class="tgme_page_description[^"]*">(.*?)<\/div>/s,
      );
      const membersMatch = body.match(
        /<div class="tgme_page_extra">(.*?)<\/div>/s,
      );

      if (nameMatch) {
        const name = nameMatch[1].replace(/<[^>]*>/g, '').trim();
        const description = descMatch
          ? descMatch[1].replace(/<[^>]*>/g, '').trim()
          : null;
        const extra = membersMatch
          ? membersMatch[1].replace(/<[^>]*>/g, '').trim()
          : null;

        let type = 'user';
        if (extra?.includes('subscriber')) type = 'channel';
        else if (extra?.includes('member')) type = 'group';
        else if (extra?.includes('online')) type = 'group';
        else if (body.includes('tgme_page_action_button')) type = 'bot';

        return { username, taken: true, name, description, type, extra };
      }

      return { username, taken: false, available: true };
    } catch {
      return {
        username,
        error: 'Could not check username — try again later',
      };
    }
  }
}
