import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/** Interval between refreshes (1 hour) */
const REFRESH_MS = 60 * 60 * 1000;

@Injectable()
export class GiftRegistryService implements OnModuleInit {
  private readonly logger = new Logger(GiftRegistryService.name);
  private giftNames: string[] = [];
  private giftNamesLower: string[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.refresh();
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  /** Returns the matched gift name if the text mentions a known gift, or null */
  matchGiftName(text: string): string | null {
    const lower = text.toLowerCase();
    for (let i = 0; i < this.giftNamesLower.length; i++) {
      if (lower.includes(this.giftNamesLower[i])) {
        return this.giftNames[i];
      }
    }
    return null;
  }

  getGiftNames(): string[] {
    return this.giftNames;
  }

  private async refresh(): Promise<void> {
    try {
      const apiKey = this.config.get<string>('getgemsApiKey')!;

      // Use GetGems /v1/gifts/collections to get all gift collection names
      const names: string[] = [];
      let after: string | undefined;

      // Paginate through all gift collections
      for (let page = 0; page < 10; page++) {
        const params: Record<string, any> = { limit: 100 };
        if (after) params.after = after;

        const { data } = await firstValueFrom(
          this.http.get('https://api.getgems.io/public-api/v1/gifts/collections', {
            headers: { Authorization: apiKey },
            params,
            timeout: 15000,
          }),
        );

        const items = data?.items || data?.collections || [];
        if (!Array.isArray(items) || items.length === 0) break;

        for (const item of items) {
          const name = item.name || item.metadata?.name;
          if (name && typeof name === 'string') {
            names.push(name);
          }
        }

        // Check for pagination cursor
        after = data?.cursor || items[items.length - 1]?.cursor;
        if (!after || items.length < 100) break;
      }

      if (names.length > 0) {
        this.giftNames = [...new Set(names)];
        this.giftNamesLower = this.giftNames.map((n) => n.toLowerCase());
        this.logger.log(`Gift registry loaded: ${this.giftNames.length} names`);
      } else {
        this.logger.warn('Gift registry: API returned no gift collections');
      }
    } catch (err) {
      this.logger.warn('Gift registry refresh failed: ' + (err as Error).message);
    }
  }
}
