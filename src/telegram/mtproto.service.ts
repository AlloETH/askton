import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

type RestrictionReason = { text: string };

@Injectable()
export class MtprotoService {
  private readonly logger = new Logger(MtprotoService.name);
  private client: TelegramClient | null = null;
  private ready = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const apiId = this.config.get<number>('telegramApiId');
    const apiHash = this.config.get<string>('telegramApiHash');
    const session = this.config.get<string>('telegramSession');

    if (!apiId || !apiHash) {
      this.logger.warn(
        'TELEGRAM_API_ID / TELEGRAM_API_HASH not set — MTProto disabled',
      );
      return;
    }

    try {
      this.client = new TelegramClient(
        new StringSession(session || ''),
        apiId,
        apiHash,
        { connectionRetries: 3 },
      );
      await this.client.connect();
      this.ready = await this.client.checkAuthorization();

      if (this.ready) {
        this.logger.log('MTProto client connected and authorized');
      } else {
        this.logger.warn(
          'MTProto not authorized — run: npx ts-node scripts/mtproto-login.ts',
        );
      }
    } catch (err) {
      this.logger.error('MTProto client failed to connect', err);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  // ── Resolve any @username to a user/channel/group entity ──

  async resolveUsername(
    username: string,
  ): Promise<{ type: string; entity: Api.User | Api.Channel | null }> {
    if (!this.ready || !this.client) return { type: 'unknown', entity: null };

    const clean = username.replace(/^@/, '');

    try {
      const result = await this.client.invoke(
        new Api.contacts.ResolveUsername({ username: clean }),
      );

      if (result.users?.length) {
        return { type: 'user', entity: result.users[0] as Api.User };
      }
      if (result.chats?.length) {
        const chat = result.chats[0] as Api.Channel;
        const type = chat.megagroup ? 'supergroup' : 'channel';
        return { type, entity: chat };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`resolveUsername failed for ${clean}: ${msg}`);
    }

    return { type: 'unknown', entity: null };
  }

  // ── User lookup with full bio ──

  async getUserFullInfo(
    username: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ready || !this.client) return null;

    const clean = username.replace(/^@/, '');

    try {
      const { entity } = await this.resolveUsername(clean);
      if (!entity || !(entity instanceof Api.User)) return null;

      const user = entity;
      const inputUser = new Api.InputUser({
        userId: user.id,
        accessHash: user.accessHash!,
      });

      let bio: string | null = null;
      let commonChatsCount = 0;

      try {
        const full = await this.client.invoke(
          new Api.users.GetFullUser({ id: inputUser }),
        );
        bio = full.fullUser.about || null;
        commonChatsCount = full.fullUser.commonChatsCount || 0;
      } catch {
        // GetFullUser may fail for some users
      }

      return {
        id: user.id?.toString(),
        type: 'user',
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        username: user.username || null,
        phone: user.phone || null,
        bio,
        isPremium: user.premium || false,
        isBot: user.bot || false,
        isVerified: user.verified || false,
        isFake: user.fake || false,
        isScam: user.scam || false,
        commonChatsCount,
        restrictionReason: this.formatRestriction(user.restrictionReason),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`getUserFullInfo failed for ${clean}: ${msg}`);
      return null;
    }
  }

  // ── Channel/group full info ──

  async getChannelFullInfo(
    username: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ready || !this.client) return null;

    const clean = username.replace(/^@/, '');

    try {
      const { type, entity } = await this.resolveUsername(clean);
      if (!entity || !(entity instanceof Api.Channel)) return null;

      const channel = entity;
      const inputChannel = new Api.InputChannel({
        channelId: channel.id,
        accessHash: channel.accessHash!,
      });

      let about: string | null = null;
      let memberCount: number | null = null;
      let adminCount: number | null = null;
      let onlineCount: number | null = null;
      let linkedChatId: string | null = null;

      try {
        const full = await this.client.invoke(
          new Api.channels.GetFullChannel({ channel: inputChannel }),
        );
        const fullChat = full.fullChat as Api.ChannelFull;
        about = fullChat.about || null;
        memberCount = fullChat.participantsCount || null;
        adminCount = fullChat.adminsCount || null;
        onlineCount = fullChat.onlineCount || null;
        linkedChatId = fullChat.linkedChatId?.toString() || null;
      } catch {
        // may fail
      }

      return {
        id: channel.id?.toString(),
        type,
        title: channel.title || null,
        username: channel.username || null,
        about,
        memberCount,
        adminCount,
        onlineCount,
        linkedChatId,
        isVerified: channel.verified || false,
        isFake: channel.fake || false,
        isScam: channel.scam || false,
        hasGeo: channel.hasGeo || false,
        slowmodeEnabled: channel.slowmodeEnabled || false,
        restrictionReason: this.formatRestriction(channel.restrictionReason),
        creationDate: channel.date
          ? new Date(channel.date * 1000).toISOString()
          : null,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`getChannelFullInfo failed for ${clean}: ${msg}`);
      return null;
    }
  }

  // ── Check if username is taken ──

  async checkUsername(
    username: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ready || !this.client) return null;

    const clean = username.replace(/^@/, '');

    try {
      const { type, entity } = await this.resolveUsername(clean);

      if (!entity) {
        return { username: clean, taken: false, available: true };
      }

      if (entity instanceof Api.User) {
        return {
          username: clean,
          taken: true,
          type: 'user',
          name:
            [entity.firstName, entity.lastName].filter(Boolean).join(' ') ||
            null,
          isBot: entity.bot || false,
          isVerified: entity.verified || false,
          isPremium: entity.premium || false,
        };
      }

      if (entity instanceof Api.Channel) {
        return {
          username: clean,
          taken: true,
          type,
          title: entity.title || null,
          isVerified: entity.verified || false,
          participantsCount:
            (entity as unknown as { participantsCount?: number })
              .participantsCount || null,
        };
      }

      return { username: clean, taken: true, type };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // USERNAME_NOT_OCCUPIED means available
      if (
        msg.includes('USERNAME_NOT_OCCUPIED') ||
        msg.includes('USERNAME_INVALID')
      ) {
        return { username: clean, taken: false, available: true };
      }
      this.logger.debug(`checkUsername failed for ${clean}: ${msg}`);
      return null;
    }
  }

  // ── Get recent messages from a public channel ──

  async getChannelMessages(
    username: string,
    limit = 10,
  ): Promise<Record<string, unknown>[] | null> {
    if (!this.ready || !this.client) return null;

    const clean = username.replace(/^@/, '');

    try {
      const { entity } = await this.resolveUsername(clean);
      if (!entity || !(entity instanceof Api.Channel)) return null;

      const result = await this.client.invoke(
        new Api.messages.GetHistory({
          peer: new Api.InputPeerChannel({
            channelId: entity.id,
            accessHash: entity.accessHash!,
          }),
          limit: Math.min(limit, 50),
          offsetId: 0,
          offsetDate: 0,
          addOffset: 0,
          maxId: 0,
          minId: 0,
          hash: 0 as unknown as Api.long,
        }),
      );

      if (!(result instanceof Api.messages.ChannelMessages)) return null;

      return result.messages
        .filter((m): m is Api.Message => m instanceof Api.Message)
        .map((m) => ({
          id: m.id,
          date: m.date ? new Date(m.date * 1000).toISOString() : null,
          text: m.message || null,
          views: m.views || null,
          forwards: m.forwards || null,
          replies: m.replies?.replies || null,
          hasMedia: !!m.media,
          editDate: m.editDate
            ? new Date(m.editDate * 1000).toISOString()
            : null,
        }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`getChannelMessages failed for ${clean}: ${msg}`);
      return null;
    }
  }

  // ── Search public channels/groups globally ──

  async searchPublic(
    query: string,
    limit = 10,
  ): Promise<Record<string, unknown>[] | null> {
    if (!this.ready || !this.client) return null;

    try {
      const result = await this.client.invoke(
        new Api.contacts.Search({ q: query, limit: Math.min(limit, 50) }),
      );

      const results: Record<string, unknown>[] = [];

      for (const chat of result.chats || []) {
        if (chat instanceof Api.Channel) {
          results.push({
            type: chat.megagroup ? 'supergroup' : 'channel',
            id: chat.id?.toString(),
            title: chat.title || null,
            username: chat.username || null,
            participantsCount:
              (chat as unknown as { participantsCount?: number })
                .participantsCount || null,
            isVerified: chat.verified || false,
          });
        }
      }

      for (const user of result.users || []) {
        if (user instanceof Api.User) {
          results.push({
            type: 'user',
            id: user.id?.toString(),
            name:
              [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
            username: user.username || null,
            isBot: user.bot || false,
            isVerified: user.verified || false,
            isPremium: user.premium || false,
          });
        }
      }

      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`searchPublic failed for "${query}": ${msg}`);
      return null;
    }
  }

  // ── Get user's star gifts ──

  async getUserStarGifts(
    username: string,
    limit = 50,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ready || !this.client) return null;

    const clean = username.replace(/^@/, '');

    try {
      const { entity } = await this.resolveUsername(clean);
      if (!entity) return null;

      let peer: Api.TypeInputPeer;
      if (entity instanceof Api.User) {
        peer = new Api.InputPeerUser({
          userId: entity.id,
          accessHash: entity.accessHash!,
        });
      } else if (entity instanceof Api.Channel) {
        peer = new Api.InputPeerChannel({
          channelId: entity.id,
          accessHash: entity.accessHash!,
        });
      } else {
        return null;
      }

      const result = await this.client.invoke(
        new Api.payments.GetSavedStarGifts({
          peer,
          offset: '',
          limit: Math.min(limit, 100),
        }),
      );

      const gifts = (result as any).gifts || [];
      const count = (result as any).count || gifts.length;

      return {
        count,
        gifts: gifts.map((g: any) => {
          const gift = g.gift;
          const base: Record<string, unknown> = {
            date: g.date ? new Date(g.date * 1000).toISOString() : null,
            nameHidden: g.nameHidden || false,
            unsaved: g.unsaved || false,
            convertStars: g.convertStars?.toString() || null,
            upgradeStars: g.upgradeStars?.toString() || null,
            message: g.message?.text || null,
          };

          if (gift?.className === 'StarGiftUnique') {
            base.type = 'unique';
            base.id = gift.id?.toString();
            base.title = gift.title || null;
            base.slug = gift.slug || null;
            base.num = gift.num || null;
            base.availabilityIssued = gift.availabilityIssued || null;
            base.availabilityTotal = gift.availabilityTotal || null;
            base.attributes = (gift.attributes || []).map((a: any) => ({
              type: a.className,
              name: a.name || null,
              rarityPermille: a.rarityPermille || null,
            }));
          } else if (gift) {
            base.type = gift.limited ? 'limited' : 'standard';
            base.id = gift.id?.toString();
            base.stars = gift.stars?.toString() || null;
            base.limited = gift.limited || false;
            base.soldOut = gift.soldOut || false;
            base.availabilityRemains = gift.availabilityRemains || null;
            base.availabilityTotal = gift.availabilityTotal || null;
          }

          return base;
        }),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`getUserStarGifts failed for ${clean}: ${msg}`);
      return null;
    }
  }

  // ── Helpers ──

  private formatRestriction(
    reasons: Api.TypeRestrictionReason[] | undefined,
  ): string | null {
    if (!reasons?.length) return null;
    return reasons
      .map((r) => (r as unknown as RestrictionReason).text)
      .join(', ');
  }
}
