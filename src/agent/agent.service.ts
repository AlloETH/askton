import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkillsService } from '../skills/skills.service.js';
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

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private systemPrompt: string;

  constructor(
    private config: ConfigService,
    private skillsService: SkillsService,
  ) {}

  onModuleInit() {
    this.systemPrompt = buildSystemPrompt(
      this.skillsService.getSkillPromptBlock(),
    );
    this.logger.log('System prompt built with registered skills');

    const provider = this.config.get<string>('llmProvider')!;
    const modelId = this.config.get<string>('llmModel')!;
    const model = getModel(provider as any, modelId as any);
    if (!model) {
      throw new Error(`Unknown model: ${provider}/${modelId}`);
    }

    const apiKey = getEnvApiKey(provider as any);
    if (!apiKey) {
      throw new Error(
        `No API key found for provider "${provider}". ` +
          'Set the appropriate env var (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.)',
      );
    }

    this.logger.log(`LLM ready: ${provider}/${modelId}`);
  }

  async run(
    query: string,
    _groupId: string,
    username: string,
    onChunk?: OnStreamChunk,
  ): Promise<string> {
    const messages: Message[] = [
      {
        role: 'user',
        content: `${username} asks: ${query}`,
        timestamp: Date.now(),
      },
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

        messages.push(this.makeAssistantMessage(JSON.stringify(skillCall)));
        messages.push({
          role: 'user',
          content: 'Data result: ' + JSON.stringify(skillResult),
          timestamp: Date.now(),
        } as UserMessage);

        const isLastIteration = i === 2;
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

  private async callLlm(
    messages: Message[],
    onChunk?: OnStreamChunk,
  ): Promise<string> {
    const provider = this.config.get<string>('llmProvider')!;
    const modelId = this.config.get<string>('llmModel')!;
    const model = getModel(provider as any, modelId as any);

    const context: Context = {
      systemPrompt: this.systemPrompt,
      messages,
    };
    const options = {
      apiKey: getEnvApiKey(provider as any),
      maxTokens: 512,
      temperature: 0.9,
    };

    this.logger.debug(
      `Calling ${provider}/${modelId} messages=${messages.length} streaming=${!!onChunk}`,
    );

    if (onChunk) {
      const eventStream = stream(model, context, options);
      let accumulated = '';

      for await (const event of eventStream) {
        if (event.type === 'text_delta' && 'delta' in event) {
          accumulated += event.delta;
          onChunk(accumulated);
        }
      }

      return accumulated || 'Sorry, I got no response.';
    }

    const result = await complete(model, context, options);

    const text = result.content
      .filter((c): c is TextContent => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return text || 'Sorry, I got no response.';
  }
}
