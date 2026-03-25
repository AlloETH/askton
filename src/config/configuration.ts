export default () => ({
  telegramToken: process.env.TELEGRAM_TOKEN,
  botUsername: process.env.BOT_USERNAME || 'asktonbot',
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: process.env.RAPIDAPI_HOST || 'chatgpt-42.p.rapidapi.com',
  rapidApiUrl:
    process.env.RAPIDAPI_URL ||
    'https://chatgpt-42.p.rapidapi.com/conversationgpt4-2',
  tonapiKey: process.env.TONAPI_KEY,
  giftassetApiKey: process.env.GIFTASSET_API_KEY,
  giftassetApiUrl: process.env.GIFTASSET_API_URL || 'https://api.giftasset.dev',
});
