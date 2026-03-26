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

  // Token still valid (with 60s buffer)
  if (Date.now() < creds.expiresAt - 60000) {
    return creds.accessToken;
  }

  // Token expired — refresh
  logger.log('Claude OAuth token expired, refreshing...');

  try {
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
    logger.log('Claude OAuth token refreshed successfully');

    return newCreds.accessToken;
  } catch (err) {
    logger.error(`Failed to refresh token: ${err}`);
    // Return the old token — it might still work briefly
    return creds.accessToken;
  }
}
