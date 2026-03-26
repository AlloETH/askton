import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Skill, SkillHandler } from '../../skill.decorator.js';

@Skill({
  name: 'web_search',
  description:
    'Search the web for current information, news, live prices, or anything not available through other skills. Use when the question is about general knowledge, current events, or real-time data outside TON/Telegram.',
  example: { query: 'current bitcoin price' },
})
export class WebSearchSkill implements SkillHandler {
  private apiKey: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('tavilyApiKey')!;
  }

  async execute(input: any): Promise<any> {
    const query: string = input.query;
    if (!query) return { error: 'Missing query' };

    const { data } = await firstValueFrom(
      this.http.post(
        'https://api.tavily.com/search',
        {
          query,
          search_depth: 'basic',
          max_results: 5,
          include_answer: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 15000,
        },
      ),
    );

    const results = (data.results || []).slice(0, 5).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }));

    return {
      query,
      answer: data.answer || null,
      results,
    };
  }
}
