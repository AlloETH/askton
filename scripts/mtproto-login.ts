/**
 * One-time login script to generate a MTProto session string.
 * Run: npx ts-node scripts/mtproto-login.ts
 *
 * You'll be prompted for your phone number and login code.
 * Copy the output session string to TELEGRAM_SESSION in your .env
 */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import input from 'input';

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '';

if (!API_ID || !API_HASH) {
  console.error('Set TELEGRAM_API_ID and TELEGRAM_API_HASH env vars first');
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 3,
  });

  await client.start({
    phoneNumber: async () => await input.text('Phone number: '),
    password: async () => await input.text('2FA password (if any): '),
    phoneCode: async () => await input.text('Login code: '),
    onError: (err: Error) => console.error(err),
  });

  const session = client.session.save() as unknown as string;
  console.log('\n✅ Logged in! Add this to your .env:\n');
  console.log(`TELEGRAM_SESSION=${session}`);

  await client.disconnect();
  process.exit(0);
})();
