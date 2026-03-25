import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import Anthropic from '@anthropic-ai/sdk';
import { SkillsService } from '../skills/skills.service';
import { buildSystemPrompt } from './agent.prompts';

interface SkillCall {
  skill: string;
  input: Record<string, unknown>;
}

interface LlmMessage {
  role: string;
  content: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private systemPrompt: string;
  private anthropic: Anthropic | null = null;
  private readonly provider: string;
  private lastRapidApiCall = 0;

  constructor(
    private http: HttpService,
    private config: ConfigService,
    private skillsService: SkillsService,
  ) {
    this.provider = this.config.get<string>('llmProvider') || 'rapidapi';

    if (this.provider === 'claude') {
      const apiKey = this.config.get<string>('anthropicApiKey');
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude',
        );
      }
      this.anthropic = new Anthropic({ apiKey });
      this.logger.log('Using Claude as LLM provider');
    } else {
      this.logger.log('Using RapidAPI as LLM provider');
    }
  }

  onModuleInit() {
    this.systemPrompt = buildSystemPrompt(
      this.skillsService.getSkillPromptBlock(),
    );
    this.logger.log('System prompt built with registered skills');
  }

  async run(
    query: string,
    groupId: string,
    username: string,
  ): Promise<string> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: `${username} asks: ${query}` },
    ];

    let reply = await this.callLlm(messages);
    this.logger.log(`LLM reply: ${reply}`);

    for (let i = 0; i < 3; i++) {
      const skillCall = this.extractSkillJson(reply);
      if (!skillCall) break;

      this.logger.log(
        `Skill detected: ${skillCall.skill} with input ${JSON.stringify(skillCall.input)}`,
      );

      try {
        const skillResult: Record<string, unknown> =
          await this.skillsService.dispatch(
            skillCall.skill,
            skillCall.input || {},
          );
        this.logger.log(`Skill result: ${JSON.stringify(skillResult)}`);

        messages.push({
          role: 'assistant',
          content: JSON.stringify(skillCall),
        });
        messages.push({
          role: 'user',
          content: 'Data result: ' + JSON.stringify(skillResult),
        });

        reply = await this.callLlm(messages);
        this.logger.log(`LLM follow-up reply: ${reply}`);
      } catch (err) {
        this.logger.error('Skill dispatch error', err);
        break;
      }
    }

    if (this.extractSkillJson(reply)) {
      reply =
        "I'm having trouble fetching that data right now. Try again in a moment.";
    }

    return reply;
  }

  private extractSkillJson(text: string): SkillCall | null {
    const patterns = [
      /```(?:json)?\s*(\{[\s\S]*?"skill"[\s\S]*?\})\s*```/,
      /(\{"skill"\s*:\s*"[^"]+"\s*,\s*"input"\s*:\s*\{[^}]*\}\s*\})/,
      /(\{"skill"\s*:\s*"[^"]+"\s*,\s*"input"\s*:\s*\{\s*\}\s*\})/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]) as SkillCall;
          if (parsed.skill) return parsed;
        } catch {
          continue;
        }
      }
    }

    const jsonMatch = text.match(/\{[^{}]*"skill"\s*:\s*"[^"]*"[^{}]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as SkillCall;
        if (parsed.skill) return parsed;
      } catch {
        // ignore
      }
    }

    return null;
  }

  private async callLlm(messages: LlmMessage[]): Promise<string> {
    if (this.provider === 'claude') {
      return this.callClaude(messages);
    }
    return this.callRapidApi(messages);
  }

  private async callClaude(messages: LlmMessage[]): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.anthropic!.messages.create({
      model: this.config.get<string>('anthropicModel') || 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemMsg?.content || '',
      messages: chatMessages,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text || 'Sorry, I got no response.';
  }

  private async rateLimitRapidApi(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRapidApiCall;
    const minInterval = 1000; // 1 request per second

    if (elapsed < minInterval) {
      const waitMs = minInterval - elapsed;
      this.logger.debug(`Rate limiting RapidAPI: waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.lastRapidApiCall = Date.now();
  }

  private async callRapidApi(messages: LlmMessage[]): Promise<string> {
    await this.rateLimitRapidApi();

    const url = this.config.get<string>('rapidApiUrl')!;

    const { data } = await firstValueFrom(
      this.http.post<Record<string, unknown>>(
        url,
        {
          messages,
          system_prompt: '',
          temperature: 0.9,
          top_k: 5,
          top_p: 0.9,
          max_tokens: 512,
          web_access: false,
        },
        {
          headers: {
            'x-rapidapi-key': this.config.get<string>('rapidApiKey'),
            'x-rapidapi-host': this.config.get<string>('rapidApiHost'),
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const result = data?.result as string | undefined;
    const choices = data?.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;

    return (
      result || choices?.[0]?.message?.content || 'Sorry, I got no response.'
    );
  }
}
