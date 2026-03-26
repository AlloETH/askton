import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SkillsService } from '../skills/skills.service';
import { buildSystemPrompt } from './agent.prompts';
import { getAnthropicApiKey } from './claude-credentials';

interface SkillCall {
  skill: string;
  input: Record<string, unknown>;
}

interface LlmMessage {
  role: string;
  content: string;
}

// Lazy-loaded pi-ai module (ESM-only, must bypass TS import→require transform)
let piAi: {
  complete: typeof import('@mariozechner/pi-ai').complete;
  stream: typeof import('@mariozechner/pi-ai').stream;
  getModel: typeof import('@mariozechner/pi-ai').getModel;
} | null = null;

// Prevent TypeScript from compiling import() to require() for ESM packages
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('@mariozechner/pi-ai')>;

async function loadPiAi() {
  if (!piAi) {
    const mod = await dynamicImport('@mariozechner/pi-ai');
    piAi = {
      complete: mod.complete,
      stream: mod.stream,
      getModel: mod.getModel,
    };
  }
  return piAi;
}

export type OnStreamChunk = (accumulated: string) => void;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private systemPrompt: string;
  private readonly provider: string;
  private lastRapidApiCall = 0;

  constructor(
    private http: HttpService,
    private config: ConfigService,
    private skillsService: SkillsService,
  ) {
    this.provider = this.config.get<string>('llmProvider') || 'rapidapi';
    this.logger.log(`Using ${this.provider} as LLM provider`);
  }

  async onModuleInit() {
    this.systemPrompt = buildSystemPrompt(
      this.skillsService.getSkillPromptBlock(),
    );
    this.logger.log('System prompt built with registered skills');

    if (this.provider === 'claude') {
      await loadPiAi();
      // Verify we can get a key (from env or ~/.claude/.credentials.json)
      await getAnthropicApiKey(this.config.get<string>('anthropicApiKey'));
      this.logger.log('pi-ai loaded for Claude provider');
    }
  }

  async run(
    query: string,
    groupId: string,
    username: string,
    onChunk?: OnStreamChunk,
  ): Promise<string> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: `${username} asks: ${query}` },
    ];

    let reply = await this.callLlm(messages, onChunk);
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

        // Stream only the final response to the user, not intermediate skill calls
        const isLastIteration = i === 2 || !this.extractSkillJson(reply);
        reply = await this.callLlm(
          messages,
          isLastIteration ? onChunk : undefined,
        );
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

  private async callLlm(
    messages: LlmMessage[],
    onChunk?: OnStreamChunk,
  ): Promise<string> {
    if (this.provider === 'claude') {
      return this.callClaude(messages, onChunk);
    }
    return this.callRapidApi(messages);
  }

  private async callClaude(
    messages: LlmMessage[],
    onChunk?: OnStreamChunk,
  ): Promise<string> {
    const { stream, complete, getModel } = await loadPiAi();

    const modelId =
      this.config.get<string>('anthropicModel') || 'claude-sonnet-4-5';

    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'assistant') {
          return {
            role: 'assistant' as const,
            content: [{ type: 'text' as const, text: m.content }],
            api: 'anthropic-messages' as const,
            provider: 'anthropic' as const,
            model: modelId,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            stopReason: 'stop' as const,
            timestamp: Date.now(),
          };
        }
        return {
          role: 'user' as const,
          content: m.content,
          timestamp: Date.now(),
        };
      });

    this.logger.debug(
      `Calling Claude model=${modelId} messages=${chatMessages.length} streaming=${!!onChunk}`,
    );

    const model = getModel('anthropic', modelId as any);
    if (!model) {
      throw new Error(`Unknown Anthropic model: ${modelId}`);
    }

    const context = {
      systemPrompt: systemMsg?.content || '',
      messages: chatMessages,
    };
    const apiKey = await getAnthropicApiKey(
      this.config.get<string>('anthropicApiKey'),
    );
    const options = {
      apiKey,
      maxTokens: 512,
      temperature: 0.9,
    };

    // Use streaming when a chunk callback is provided
    if (onChunk) {
      const eventStream = stream(model, context, options);
      let accumulated = '';

      for await (const event of eventStream) {
        if (event.type === 'text_delta') {
          accumulated += event.delta;
          onChunk(accumulated);
        }
      }

      return accumulated || 'Sorry, I got no response.';
    }

    // Non-streaming fallback
    const result = await complete(model, context, options);

    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('');

    return text || 'Sorry, I got no response.';
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
