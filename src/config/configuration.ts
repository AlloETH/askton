export default () => ({
  telegramToken: process.env.TELEGRAM_TOKEN,
  botUsername: process.env.BOT_USERNAME || 'asktonbot',
  llmProvider: process.env.LLM_PROVIDER || 'anthropic',
  llmModel: process.env.LLM_MODEL || 'claude-sonnet-4-5',
  llmFastModel: process.env.LLM_FAST_MODEL || '',
  telegramApiId: process.env.TELEGRAM_API_ID
    ? parseInt(process.env.TELEGRAM_API_ID, 10)
    : undefined,
  telegramApiHash: process.env.TELEGRAM_API_HASH,
  telegramSession: process.env.TELEGRAM_SESSION || '',
  tonapiKey: process.env.TONAPI_KEY,
  getgemsApiKey: process.env.GETGEMS_API_KEY,
  giftassetApiKey: process.env.GIFTASSET_API_KEY,
  giftassetApiUrl: process.env.GIFTASSET_API_URL || 'https://api.giftasset.dev',
  tavilyApiKey: process.env.TAVILY_API_KEY,
});
