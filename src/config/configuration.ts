export default () => ({
  telegramToken: process.env.TELEGRAM_TOKEN,
  botUsername: process.env.BOT_USERNAME || 'asktonbot',
  llmProvider: process.env.LLM_PROVIDER || 'rapidapi',
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: process.env.RAPIDAPI_HOST || 'chatgpt-42.p.rapidapi.com',
  rapidApiUrl:
    process.env.RAPIDAPI_URL ||
    'https://chatgpt-42.p.rapidapi.com/conversationgpt4-2',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  telegramApiId: process.env.TELEGRAM_API_ID
    ? parseInt(process.env.TELEGRAM_API_ID, 10)
    : undefined,
  telegramApiHash: process.env.TELEGRAM_API_HASH,
  telegramSession: process.env.TELEGRAM_SESSION || '',
  tonapiKey: process.env.TONAPI_KEY,
  giftassetApiKey: process.env.GIFTASSET_API_KEY,
  giftassetApiUrl: process.env.GIFTASSET_API_URL || 'https://api.giftasset.dev',
});
