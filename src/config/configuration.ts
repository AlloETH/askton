export default () => ({
  telegramToken: process.env.TELEGRAM_TOKEN,
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: process.env.RAPIDAPI_HOST,
  rapidApiUrl: process.env.RAPIDAPI_URL,
  botUsername: process.env.BOT_USERNAME || 'tonsaybot',
  tonapiKey: process.env.TONAPI_KEY,
});
