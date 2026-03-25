import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SkillsService } from '../skills/skills.service';
import { buildSystemPrompt } from './agent.prompts';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private systemPrompt: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
    private skillsService: SkillsService,
  ) {}

  onModuleInit() {
    this.systemPrompt = buildSystemPrompt(this.skillsService.getSkillPromptBlock());
    this.logger.log('System prompt built with registered skills');
  }

  async run(query: string, groupId: string, username: string): Promise<string> {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: `${username} asks: ${query}` },
    ];

    let reply = await this.callLlm(messages);
    this.logger.log(`LLM reply: ${reply}`);

    for (let i = 0; i < 3; i++) {
      const skillCall = this.extractSkillJson(reply);
      if (!skillCall) break;

      this.logger.log(`Skill detected: ${skillCall.skill} with input ${JSON.stringify(skillCall.input)}`);

      try {
        const skillResult = await this.skillsService.dispatch(skillCall.skill, skillCall.input || {});
        this.logger.log(`Skill result: ${JSON.stringify(skillResult)}`);

        messages.push({ role: 'assistant', content: JSON.stringify(skillCall) });
        messages.push({ role: 'user', content: 'Data result: ' + JSON.stringify(skillResult) });

        reply = await this.callLlm(messages);
        this.logger.log(`LLM follow-up reply: ${reply}`);
      } catch (err) {
        this.logger.error('Skill dispatch error', err);
        break;
      }
    }

    if (this.extractSkillJson(reply)) {
      reply = "I'm having trouble fetching that data right now. Try again in a moment.";
    }

    return reply;
  }

  private extractSkillJson(text: string): { skill: string; input: any } | null {
    const patterns = [
      /```(?:json)?\s*(\{[\s\S]*?"skill"[\s\S]*?\})\s*```/,
      /(\{"skill"\s*:\s*"[^"]+"\s*,\s*"input"\s*:\s*\{[^}]*\}\s*\})/,
      /(\{"skill"\s*:\s*"[^"]+"\s*,\s*"input"\s*:\s*\{\s*\}\s*\})/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.skill) return parsed;
        } catch {
          continue;
        }
      }
    }

    const jsonMatch = text.match(/\{[^{}]*"skill"\s*:\s*"[^"]*"[^{}]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.skill) return parsed;
      } catch {
        // ignore
      }
    }

    return null;
  }

  private async callLlm(messages: any[]): Promise<string> {
    const url = this.config.get<string>('rapidApiUrl');

    const { data } = await firstValueFrom(
      this.http.post(
        url!,
        JSON.stringify({ messages, web_access: false }),
        {
          headers: {
            'x-rapidapi-key': this.config.get<string>('rapidApiKey'),
            'x-rapidapi-host': this.config.get<string>('rapidApiHost'),
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return data?.result || data?.choices?.[0]?.message?.content || 'Sorry, I got no response.';
  }
}
