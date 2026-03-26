import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const logger = new Logger('ClaudeCredentials');

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface CredentialsFile {
  claudeAiOauth?: OAuthCredentials;
}

interface RefreshResult {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  expiresAt?: number;
  expires_in?: number;
}

type RefreshFn = (refreshToken: string) => Promise<RefreshResult>;

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ refreshAnthropicToken: RefreshFn }>;

let refreshFn: RefreshFn | null = null;

async function loadRefreshFn(): Promise<RefreshFn> {
  if (!refreshFn) {
    const oauth = await dynamicImport('@mariozechner/pi-ai/oauth');
    refreshFn = oauth.refreshAnthropicToken;
  }
  return refreshFn;
}

function getCredentialsPath(): string {
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

function readCredentials(): OAuthCredentials | null {
  try {
    const raw = fs.readFileSync(getCredentialsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as CredentialsFile;
    return parsed.claudeAiOauth || null;
  } catch {
    return null;
  }
}

function writeCredentials(creds: OAuthCredentials): void {
  const filePath = getCredentialsPath();
  try {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<
        string,
        unknown
      >;
    } catch {
      // file doesn't exist yet
    }
    existing.claudeAiOauth = creds;
    fs.writeFileSync(filePath, JSON.stringify(existing), 'utf-8');
  } catch (err) {
    logger.warn(`Failed to write credentials: ${err}`);
  }
}

async function doRefresh(
  creds: OAuthCredentials,
): Promise<OAuthCredentials> {
  const refresh = await loadRefreshFn();
  const result = await refresh(creds.refreshToken);

  const newCreds: OAuthCredentials = {
    accessToken: result.accessToken || result.access_token || '',
    refreshToken:
      result.refreshToken || result.refresh_token || creds.refreshToken,
    expiresAt:
      result.expiresAt || Date.now() + (result.expires_in || 3600) * 1000,
  };

  writeCredentials(newCreds);
  return newCreds;
}

/**
 * Get a valid Anthropic API key, refreshing the OAuth token if needed.
 * Reads from Claude Code's ~/.claude/.credentials.json
 * Falls back to the provided API key if no credentials file exists.
 */
export async function getAnthropicApiKey(
  fallbackKey?: string,
): Promise<string> {
  const creds = readCredentials();

  if (!creds) {
    if (fallbackKey) return fallbackKey;
    throw new Error(
      'No Claude credentials found. Set ANTHROPIC_API_KEY or log in with Claude Code.',
    );
  }

  // Token still valid (with 5 min buffer)
  if (Date.now() < creds.expiresAt - 300_000) {
    return creds.accessToken;
  }

  // Token expired or expiring soon — refresh
  logger.log('Claude OAuth token expired, refreshing...');

  try {
    const newCreds = await doRefresh(creds);
    logger.log('Claude OAuth token refreshed successfully');
    return newCreds.accessToken;
  } catch (err) {
    logger.error(`Failed to refresh token: ${err}`);
    return creds.accessToken;
  }
}

/**
 * Start a background timer that proactively refreshes the token
 * every 30 minutes so it never expires between requests.
 */
export function startCredentialRefreshTimer(): void {
  const INTERVAL = 30 * 60 * 1000; // 30 minutes

  setInterval(async () => {
    const creds = readCredentials();
    if (!creds?.refreshToken) return;

    // Refresh if token expires within the next 45 minutes
    if (Date.now() > creds.expiresAt - 45 * 60 * 1000) {
      logger.log('Proactive token refresh triggered');
      try {
        await doRefresh(creds);
        logger.log('Proactive token refresh succeeded');
      } catch (err) {
        logger.error(`Proactive token refresh failed: ${err}`);
      }
    }
  }, INTERVAL);

  logger.log('Credential refresh timer started (every 30m)');
}
