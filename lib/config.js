const path = require('path');
const fs = require('fs');
require('dotenv').config();

function parseJsonEnv(name, fallback) {
  try {
    const value = process.env[name];
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const defaultWatchlist = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum' },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana' },
  { symbol: 'BNB', name: 'BNB', coingeckoId: 'binancecoin' }
];

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

module.exports = {
  port: Number(process.env.PORT || 3000),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 60000),
  minScoreToNotify: Number(process.env.MIN_SCORE_TO_NOTIFY || 75),
  appPassword: process.env.APP_PASSWORD || '1234',
  sessionSecret: process.env.SESSION_SECRET || 'degistir-bunu-lutfen',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:sen@example.com',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
  watchlist: parseJsonEnv('WATCHLIST_JSON', defaultWatchlist),
  customProjectSources: parseJsonEnv('CUSTOM_PROJECT_SOURCES', []),
  dataDir,
  eventsFile: path.join(dataDir, 'events-cache.json'),
  subsFile: path.join(dataDir, 'subscriptions.json')
};
