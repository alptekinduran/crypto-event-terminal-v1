const Parser = require('rss-parser');
const crypto = require('crypto');
const config = require('./config');

const parser = new Parser({ timeout: 20000 });

const SOURCE_PRIORITY = {
  official: 30,
  media: 18,
  project: 16,
  macro: 14
};

const MAJOR_COINS = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'TRX', 'AVAX', 'LINK']);
const WATCHLIST_SYMBOLS = new Set(config.watchlist.map((w) => String(w.symbol || '').toUpperCase()));

const ALIASES = {
  BITCOIN: 'BTC',
  BTC: 'BTC',
  ETHEREUM: 'ETH',
  ETH: 'ETH',
  SOLANA: 'SOL',
  SOL: 'SOL',
  BINANCE: 'BNB',
  BNB: 'BNB',
  RIPPLE: 'XRP',
  XRP: 'XRP',
  CARDANO: 'ADA',
  ADA: 'ADA',
  DOGECOIN: 'DOGE',
  DOGE: 'DOGE',
  CHAINLINK: 'LINK',
  LINK: 'LINK',
  AVALANCHE: 'AVAX',
  AVAX: 'AVAX',
  TRON: 'TRX',
  TRX: 'TRX',
  TETHER: 'USDT',
  USDT: 'USDT',
  USDC: 'USDC'
};

for (const item of config.watchlist) {
  if (item.name) ALIASES[String(item.name).toUpperCase()] = String(item.symbol).toUpperCase();
  if (item.symbol) ALIASES[String(item.symbol).toUpperCase()] = String(item.symbol).toUpperCase();
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim();
}

function inferEventType(text) {
  const t = String(text || '').toLowerCase();
  if (/(delist|delisting|remove.*trading pair|remove.*spot)/.test(t)) return 'delisting';
  if (/(listing|will list|lists|spot list|launchpool|launchpad)/.test(t)) return 'listing';
  if (/(exploit|hack|breach|drain|stolen|attack)/.test(t)) return 'exploit';
  if (/(etf|19b-4|s-1|sec filing)/.test(t)) return 'etf';
  if (/(sec|lawsuit|enforcement|charged|settlement)/.test(t)) return 'enforcement';
  if (/(unlock|vesting|token unlock)/.test(t)) return 'unlock';
  if (/(mainnet|upgrade|hard fork|testnet)/.test(t)) return 'mainnet';
  if (/(partnership|partner|collaboration|joins with)/.test(t)) return 'partnership';
  if (/(buyback|burn)/.test(t)) return 'buyback';
  if (/(maintenance|suspend|withdrawal|deposits? .* suspend)/.test(t)) return 'maintenance';
  return 'other';
}

function extractSymbols(text) {
  const upper = String(text || '').toUpperCase();
  const symbols = new Set();
  const exact = upper.match(/\b[A-Z]{2,10}\b/g) || [];
  for (const token of exact) {
    if (ALIASES[token]) symbols.add(ALIASES[token]);
    else if (MAJOR_COINS.has(token)) symbols.add(token);
  }
  for (const [name, symbol] of Object.entries(ALIASES)) {
    if (upper.includes(name)) symbols.add(symbol);
  }
  return Array.from(symbols).slice(0, 6);
}

function computeImpactDirection(type, symbols) {
  if (['delisting', 'exploit', 'enforcement'].includes(type)) return 'negatif';
  if (['listing', 'etf', 'partnership', 'mainnet', 'buyback'].includes(type)) return 'pozitif';
  if (type === 'unlock') return 'temkinli negatif';
  if (type === 'maintenance') return 'karisik';
  return symbols.length ? 'karisik' : 'nÃ¶tr';
}

function computeScore(event) {
  let score = SOURCE_PRIORITY[event.sourceType] || 10;
  if (event.type === 'listing') score += 28;
  else if (event.type === 'delisting') score += 34;
  else if (event.type === 'exploit') score += 36;
  else if (event.type === 'etf') score += 26;
  else if (event.type === 'enforcement') score += 26;
  else if (event.type === 'unlock') score += 18;
  else if (event.type === 'mainnet') score += 14;
  else if (event.type === 'partnership') score += 12;
  else if (event.type === 'maintenance') score += 10;
  else score += 6;

  if (event.symbols.some((s) => WATCHLIST_SYMBOLS.has(s))) score += 12;
  if (event.symbols.some((s) => MAJOR_COINS.has(s))) score += 8;
  if (/etf|sec|binance|bitcoin|ethereum|solana/i.test(event.title || '')) score += 4;

  return Math.max(0, Math.min(99, score));
}

function confidenceFrom(event) {
  let confidence = 50;
  if (event.sourceType === 'official') confidence += 18;
  if (event.sourceType === 'media') confidence += 8;
  if (event.symbols.length) confidence += 10;
  if (event.type !== 'other') confidence += 10;
  return Math.max(0, Math.min(98, confidence));
}

function normalizeEvent(partial) {
  const title = cleanText(partial.title);
  const body = cleanText(partial.body || '');
  const type = inferEventType(`${title} ${body}`);
  const symbols = extractSymbols(`${title} ${body}`);
  const source = partial.source || 'Bilinmeyen kaynak';
  const sourceType = partial.sourceType || 'media';
  const url = partial.url || '#';
  const publishedAt = partial.publishedAt || new Date().toISOString();
  const id = crypto.createHash('sha1').update(`${source}|${title}|${url}`).digest('hex');
  const impact = computeImpactDirection(type, symbols);
  const score = computeScore({ sourceType, type, symbols, title });
  const confidence = confidenceFrom({ sourceType, type, symbols });
  return {
    id,
    title,
    body,
    type,
    symbols,
    source,
    sourceType,
    url,
    publishedAt,
    impact,
    score,
    confidence
  };
}

async function fetchRssSource(source) {
  const feed = await parser.parseURL(source.url);
  const items = (feed.items || []).slice(0, source.limit || 25);
  return items.map((item) => normalizeEvent({
    title: item.title,
    body: item.contentSnippet || item.content || item.summary || item.description || '',
    source: source.name,
    sourceType: source.sourceType || 'media',
    url: item.link,
    publishedAt: item.isoDate || item.pubDate || new Date().toISOString()
  }));
}

const DEFAULT_RSS_SOURCES = [
  {
    name: 'CoinDesk RSS',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',
    sourceType: 'media',
    limit: 25
  },
  {
    name: 'Cointelegraph RSS',
    url: 'https://cointelegraph.com/rss',
    sourceType: 'media',
    limit: 25
  },
  {
    name: 'CryptoSlate Feed',
    url: 'https://cryptoslate.com/feed/',
    sourceType: 'media',
    limit: 20
  },
  {
    name: 'Decrypt Feed',
    url: 'https://decrypt.co/feed',
    sourceType: 'media',
    limit: 20
  },
  {
    name: 'Bitcoin Magazine Feed',
    url: 'https://bitcoinmagazine.com/.rss/full/',
    sourceType: 'media',
    limit: 20
  },
  {
    name: 'Google News SEC Crypto',
    url: 'https://news.google.com/rss/search?q=SEC+crypto+ETF+OR+Binance+listing&hl=en-US&gl=US&ceid=US:en',
    sourceType: 'macro',
    limit: 20
  }
];

async function fetchAllRawEvents() {
  const tasks = [
    ...DEFAULT_RSS_SOURCES.map((source) => fetchRssSource(source).catch(() => [])),
    ...config.customProjectSources.map((source) => fetchRssSource(source).catch(() => []))
  ];

  const results = await Promise.allSettled(tasks);
  const merged = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) merged.push(...result.value);
  }

  return uniqBy(merged, (e) => e.id)
    .sort((a, b) => {
      const aTime = new Date(a.publishedAt || 0).getTime();
      const bTime = new Date(b.publishedAt || 0).getTime();
      return b.score - a.score || bTime - aTime;
    })
    .slice(0, 200);
}

function matchesWatchlist(event) {
  if (!event.symbols.length) return false;
  return event.symbols.some((s) => WATCHLIST_SYMBOLS.has(String(s).toUpperCase()));
}

module.exports = {
  fetchAllRawEvents,
  normalizeEvent,
  matchesWatchlist
};
