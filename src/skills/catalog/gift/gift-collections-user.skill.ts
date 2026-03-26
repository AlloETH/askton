import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'get_user_gift_collections',
  description:
    'list all gift collections owned by a Telegram user with counts and collection details. Requires @username',
  example: { username: 'durov' },
})
export class GiftCollectionsUserSkill implements SkillHandler {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('giftassetApiKey')!;
    this.baseUrl = this.config.get<string>('giftassetApiUrl')!;
  }

  async execute(input: any): Promise<any> {
    const username: string = (input.username || input.user || '')
      .replace(/^@/, '')
      .trim();
    if (!username) return { error: 'Missing username' };

    const headers = {
      'x-api-token': this.apiKey,
      'Content-Type': 'application/json',
    };
    const limit = Math.min(input.limit || 100, 100);

    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/v1/gifts/get_all_collections_by_user?username=${encodeURIComponent(username)}`,
        { limit },
        { headers, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'User not found or no collections' };
    }

    return data;
  }
}
