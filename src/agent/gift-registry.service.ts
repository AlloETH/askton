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
      const apiKey = this.config.get<string>('giftassetApiKey')!;
      const baseUrl = this.config.get<string>('giftassetApiUrl')!;

      const { data } = await firstValueFrom(
        this.http.get(`${baseUrl}/api/v1/gifts/get_gifts_price_list`, {
          headers: { 'x-api-token': apiKey },
          params: { models: true },
          timeout: 15000,
        }),
      );

      if (!data || data.status === 'error') {
        this.logger.warn('Failed to fetch gift list: ' + (data?.message || 'unknown'));
        return;
      }

      // Extract gift collection names from the response
      // API returns { collection_floors: { "Gift Name": {...}, ... }, models_prices: [...] }
      const names: string[] = [];
      const raw = data.collection_floors ?? data.data ?? data.gifts ?? data.items ?? data;

      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        // Keys are the gift names themselves
        names.push(...Object.keys(raw));
      } else if (Array.isArray(raw)) {
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue;
          const name =
            (item as any).collection_name ||
            (item as any).name ||
            (item as any).gift_name ||
            (item as any).title;
          if (name && typeof name === 'string') {
            names.push(name);
          }
        }
      }

      if (names.length > 0) {
        this.giftNames = [...new Set(names)];
        this.giftNamesLower = this.giftNames.map((n) => n.toLowerCase());
        this.logger.log(`Gift registry loaded: ${this.giftNames.length} names`);
      } else {
        const sampleKey = Object.keys(raw ?? {})[0];
        const sampleVal = sampleKey ? JSON.stringify((raw as any)[sampleKey]).slice(0, 200) : 'empty';
        this.logger.warn(
          `Gift registry: no names extracted. collection_floors type=${Array.isArray(raw) ? 'array' : typeof raw}, sample: ${sampleKey}=${sampleVal}`,
        );
      }
    } catch (err) {
      this.logger.warn('Gift registry refresh failed: ' + (err as Error).message);
    }
  }
}
