import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkillsService } from '../skills/skills.service.js';
import { GiftRegistryService } from './gift-registry.service.js';
import { buildSystemPrompt } from './agent.prompts.js';
import { getModel, getEnvApiKey, stream, complete } from '@mariozechner/pi-ai';
import type {
  AssistantMessage,
  UserMessage,
  Message,
  TextContent,
  Context,
} from '@mariozechner/pi-ai';

interface SkillCall {
  skill: string;
  input: Record<string, unknown>;
}

export type OnStreamChunk = (accumulated: string) => void;

/** Threshold in chars — if skill result is larger, use the full model */
const LARGE_RESULT_THRESHOLD = 2000;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private systemPrompt: string;
  private hasFastModel = false;

  constructor(
    private config: ConfigService,
    private skillsService: SkillsService,
    private giftRegistry: GiftRegistryService,
  ) {}

  onModuleInit() {
    this.systemPrompt = buildSystemPrompt(
      this.skillsService.getSkillPromptBlock(),
    );
    this.logger.log('System prompt built with registered skills');

    const provider = this.config.get<string>('llmProvider')!;
    const modelId = this.config.get<string>('llmModel')!;
    const fastModelId = this.config.get<string>('llmFastModel');

    const model = getModel(provider as any, modelId as any);
    if (!model) throw new Error(`Unknown model: ${provider}/${modelId}`);

    const apiKey = getEnvApiKey(provider as any);
    if (!apiKey) {
      throw new Error(
        `No API key found for provider "${provider}". ` +
          'Set the appropriate env var (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.)',
      );
    }

    if (fastModelId) {
      const fast = getModel(provider as any, fastModelId as any);
      if (fast) {
        this.hasFastModel = true;
        this.logger.log(
          `LLM ready: fast=${provider}/${fastModelId} full=${provider}/${modelId}`,
        );
      } else {
        this.logger.warn(
          `Fast model "${fastModelId}" not found, using ${modelId} for all calls`,
        );
        this.logger.log(`LLM ready: ${provider}/${modelId}`);
      }
    } else {
      this.logger.log(`LLM ready: ${provider}/${modelId} (no fast model set)`);
    }
  }

  async run(
    query: string,
    _groupId: string,
    username: string,
    onChunk?: OnStreamChunk,
  ): Promise<string> {
    // Check if the query mentions a known Telegram Gift — hint the LLM without extra API calls
    const matchedGift = this.giftRegistry.matchGiftName(query);
    const userContent = matchedGift
      ? `[Context: "${matchedGift}" is a Telegram Gift — use gift skills, not getgems]\n${username} asks: ${query}`
      : `${username} asks: ${query}`;

    const messages: Message[] = [
      {
        role: 'user',
        content: userContent,
        timestamp: Date.now(),
      },
    ];

    // First call: skill dispatch — use full model with low temperature for reliable JSON
    let reply = await this.callLlm(messages, undefined, 'full', 0.3);
    this.logger.log(`LLM reply: ${reply}`);

    for (let i = 0; i < 5; i++) {
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

        messages.push(this.makeAssistantMessage(JSON.stringify(skillCall)));
        const resultStr = this.truncateResult(skillResult);
        messages.push({
          role: 'user',
          content: 'Data result: ' + resultStr,
          timestamp: Date.now(),
        } as UserMessage);

        // Pick model tier based on result size:
        // Small data → fast model can summarize it fine
        // Large data → full model for better comprehension
        const tier = resultStr.length > LARGE_RESULT_THRESHOLD ? 'full' : 'fast';
        const isLastIteration = i === 4;
        reply = await this.callLlm(
          messages,
          isLastIteration ? onChunk : undefined,
          tier,
        );
        this.logger.log(`LLM follow-up reply (${tier}): ${reply}`);
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

  /** Strip image URLs and truncate skill results to avoid exceeding context */
  private truncateResult(
    result: Record<string, unknown>,
    maxChars = 200000,
  ): string {
    let json = JSON.stringify(result, (key, value) => {
      if (
        typeof value === 'string' &&
        (key === 'image' ||
          key === 'image_url' ||
          key === 'preview' ||
          key === 'icon') &&
        value.startsWith('http')
      ) {
        return undefined;
      }
      return value;
    });

    if (json.length <= maxChars) return json;

    const parsed: Record<string, unknown> = JSON.parse(json) as Record<
      string,
      unknown
    >;
    this.trimLargeValues(parsed);
    json = JSON.stringify(parsed);

    if (json.length <= maxChars) return json;

    return json.substring(0, maxChars) + '...(truncated)';
  }

  private trimLargeValues(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
      const val = obj[key];

      if (Array.isArray(val) && val.length > 100) {
        const original = val.length;
        obj[key] = [
          ...(val as unknown[]).slice(0, 100),
          { _truncated: `${original - 100} more items omitted` },
        ];
      }

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const keys = Object.keys(val as Record<string, unknown>);
        if (keys.length > 50) {
          const trimmed: Record<string, unknown> = {};
          for (const k of keys.slice(0, 50)) {
            trimmed[k] = (val as Record<string, unknown>)[k];
          }
          trimmed._truncated = `${keys.length - 50} more entries omitted`;
          obj[key] = trimmed;
        } else {
          this.trimLargeValues(val as Record<string, unknown>);
        }
      }
    }
  }

  private makeAssistantMessage(text: string): AssistantMessage {
    const provider = this.config.get<string>('llmProvider')!;
    const modelId = this.config.get<string>('llmModel')!;
    return {
      role: 'assistant',
      content: [{ type: 'text', text } as TextContent],
      api: 'anthropic-messages',
      provider,
      model: modelId,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: Date.now(),
    };
  }

  private resolveModel(tier: 'fast' | 'full') {
    const provider = this.config.get<string>('llmProvider')!;
    const fullModelId = this.config.get<string>('llmModel')!;
    const fastModelId = this.config.get<string>('llmFastModel');

    if (tier === 'fast' && this.hasFastModel && fastModelId) {
      const model = getModel(provider as any, fastModelId as any);
      return { model, modelId: fastModelId, provider };
    }

    const model = getModel(provider as any, fullModelId as any);
    return { model, modelId: fullModelId, provider };
  }

  private async callLlm(
    messages: Message[],
    onChunk?: OnStreamChunk,
    tier: 'fast' | 'full' = 'full',
    temperature = 0.9,
  ): Promise<string> {
    const { model, modelId, provider } = this.resolveModel(tier);

    const context: Context = {
      systemPrompt: this.systemPrompt,
      messages,
    };
    const options = {
      apiKey: getEnvApiKey(provider as any),
      maxTokens: model.maxTokens,
      temperature,
    };

    this.logger.debug(
      `Calling ${provider}/${modelId} [${tier}] messages=${messages.length} streaming=${!!onChunk}`,
    );

    if (onChunk) {
      try {
        const eventStream = stream(model, context, options);
        let accumulated = '';
        let streamError: string | undefined;

        for await (const event of eventStream) {
          if (event.type === 'text_delta' && 'delta' in event) {
            accumulated += event.delta;
            onChunk(accumulated);
          } else if (event.type === 'error') {
            streamError = event.error.errorMessage;
          }
        }

        if (streamError) {
          const msg = this.extractRateLimitMessage(streamError);
          if (msg) return msg;
          this.logger.error(`Stream error from ${provider}/${modelId}: ${streamError}`);
        }

        return accumulated || 'Sorry, I got no response.';
      } catch (err) {
        const msg = this.extractRateLimitMessage(err);
        if (msg) return msg;
        throw err;
      }
    }

    // Retry once on empty response (Groq occasionally returns empty content)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await complete(model, context, options);

        // Check for API-level errors (rate limits, etc.) returned in the response
        if (result.stopReason === 'error' && result.errorMessage) {
          const msg = this.extractRateLimitMessage(result.errorMessage);
          if (msg) return msg;
          this.logger.error(
            `API error from ${provider}/${modelId}: ${result.errorMessage}`,
          );
          return `Sorry, something went wrong (${result.errorMessage}).`;
        }

        const text = result.content
          .filter((c): c is TextContent => c.type === 'text')
          .map((c) => c.text)
          .join('');

        if (text) return text;

        this.logger.warn(
          `Empty response from ${provider}/${modelId} (attempt ${attempt + 1}), ` +
            `content types: [${result.content.map((c) => c.type).join(', ')}]`,
        );
      } catch (err) {
        const msg = this.extractRateLimitMessage(err);
        if (msg) return msg;
        throw err;
      }
    }

    return 'Sorry, I got no response.';
  }

  private extractRateLimitMessage(err: unknown): string | null {
    const msg = err instanceof Error ? err.message : String(err);
    // Match both "rate limit ... try again in X" and "rate_limit_exceeded" error codes
    const match = msg.match(/rate limit.*?please try again in ([^\s.]+)/i);
    if (match) {
      this.logger.warn(`Rate limit hit: ${msg}`);
      return `Rate limit reached — please try again in ${match[1]}.`;
    }
    if (/rate.?limit.?exceeded/i.test(msg)) {
      this.logger.warn(`Rate limit hit: ${msg}`);
      return `Rate limit reached — please try again later.`;
    }
    return null;
  }
}
