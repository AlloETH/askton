import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_user_gift_collections',
  description:
    'list all gift collections owned by a Telegram user with counts and collection details',
  example: { user_id: '123456789' },
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
    const userId: string = input.user_id || input.username;
    if (!userId) return { error: 'Missing user_id or username' };

    const headers = { 'x-api-token': this.apiKey };

    const { data } = await firstValueFrom(
      this.http.get(
        `${this.baseUrl}/api/v1/gifts/get_all_collections_by_user`,
        { headers, params: { user_id: userId }, timeout: 15000 },
      ),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'User not found or no collections' };
    }

    return data;
  }
}
