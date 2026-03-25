import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator';

@Skill({
  name: 'get_gift_provider_volumes',
  description:
    'compare marketplace sales volumes — see which platform (GetGems, MRKT, Portals, Tonnel) has the most gift trading activity',
  example: {},
})
export class GiftProviderVolumesSkill implements SkillHandler {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('giftassetApiKey')!;
    this.baseUrl = this.config.get<string>('giftassetApiUrl')!;
  }

  async execute(): Promise<any> {
    const headers = { 'x-api-token': this.apiKey };

    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/gifts/get_providers_volumes`, {
        headers,
        timeout: 15000,
      }),
    );

    if (!data || data.status === 'error') {
      return { error: data?.message || 'Failed to fetch provider volumes' };
    }

    return data;
  }
}
