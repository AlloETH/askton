import { Update, On, Start, Help, Ctx } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramService } from './telegram.service.js';

@Update()
export class TelegramUpdate {
  constructor(private telegramService: TelegramService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await ctx.reply(
      'Hey! Add me to a group and @mention me to get live TON data.\n\n' +
        'I can check TON prices, wallet balances, NFT info, and Fragment username prices.',
    );
  }

  @Help()
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      '*What I can do:*\n\n' +
        '💰 *TON Price* — current TON price in USD/EUR/BTC\n' +
        '👛 *Wallet Info* — balance and NFTs for any wallet or @username\n' +
        '🎁 *NFT Info* — metadata for any TON NFT\n' +
        '🏷 *Username Price* — Fragment marketplace pricing\n\n' +
        'Just @mention me in a group with your question!\n' +
        "Example: `@asktonbot what's TON trading at?`",
      { parse_mode: 'Markdown' },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    await this.telegramService.handleMessage(ctx);
  }
}
