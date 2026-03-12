const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const crypto = require('crypto');
const config = require('./config');

const parser = new Parser({ timeout: 15000 });

const SOURCE_PRIORITY = {
  binance: 34,
  sec: 28,
  exchange: 24,
  project: 22,
  media: 10
};

const MAJOR_COINS = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE']);
const POSITIVE_TYPES = new Set(['listing', 'etf', 'partnership', 'mainnet', 'buyback', 'burn']);
const NEGATIVE_TYPES = new Set(['delisting', 'exploit', 'hack', 'enforcement', 'lawsuit', 'unlock_large']);

const ALIASES = {
  BITCOIN: 'BTC',
  ETHEREUM: 'ETH',
  SOLANA: 'SOL',
  BINANCE: 'BNB',
  RIPPLE: 'XRP',
  CARDANO: 'ADA',
  DOGECOIN: 'DOGE'
};

for (const item of config.watchlist) {
  if (item.name) ALIASES[item.name.toUpperCase()] = item.symbol.toUpperCase();
  if (item.symbol) ALIASES[item.symbol.toUpperCase()] = item.symbol.toUpperCase();
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
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim();
}

function inferEventType(text) {
  const t = text.toLowerCase();
  if (/delist|notice of removal|remove spot trading pairs|remove margin trading pairs/.test(t)) return 'delisting';
  if (/list|listing|will list|spot listing|launchpool|launchpad/.test(t)) return 'listing';
  if (/exploit|hack|breach|drained|stolen/.test(t)) return 'exploit';
  if (/sec|lawsuit|settlement|enforcement|charges|charged/.test(t)) return 'enforcement';
  if (/etf|sec filing|19b-4|s-1/.test(t)) return 'etf';
  if (/unlock|token unlock|vesting/.test(t)) return 'unlock';
  if (/mainnet|testnet|upgrade|hard fork/.test(t)) return 'mainnet';
  if (/partnership|partner|collaboration/.test(t)) return 'partnership';
  if (/burn|buyback/.test(t)) return 'buyback';
  if (/maintenance|suspend|deposit.*withdrawal|withdrawal.*suspend/.test(t)) return 'maintenance';
  return 'other';
}

function extractSymbols(text) {
  const upper = String(text || '').toUpperCase();
  const symbols = new Set();
  const exact = upper.match(/\b[A-Z]{2,10}\b/g) || [];
  for (const token of exact) {
    if (ALIASES[token]) symbols.add(ALIASES[token]);
    else if (config.watchlist.some((w) => w.symbol.toUpperCase() === token)) symbols.add(token);
    else if (MAJOR_COINS.has(token)) symbols.add(token);
  }
  for (const [name, symbol] of Object.entries(ALIASES)) {
    if (upper.includes(name)) symbols.add(symbol);
  }
  return Array.from(symbols).slice(0, 6);
}

function computeImpactDirection(type, symbols) {
  if (NEGATIVE_TYPES.has(type)) return 'negatif';
  if (POSITIVE_TYPES.has(type)) return 'pozitif';
  if (type === 'unlock') return 'temkinli negatif';
  if (type === 'maintenance') return 'karisik';
  return symbols.length ? 'karisik' : 'nötr';
}

function computeScore(event) {
  let score = SOURCE_PRIORITY[event.sourceType] || 8;
  const type = event.type;
  if (type === 'listing') score += 36;
  else if (type === 'delisting') score += 40;
  else if (type === 'exploit') score += 42;
  else if (type === 'enforcement') score += 35;
  else if (type === 'etf') score += 32;
  else if (type === 'unlock') score += 24;
  else if (type === 'mainnet') score += 18;
  else if (type === 'partnership') score += 16;
  else if (type === 'maintenance') score += 12;
  else score += 6;

  if (event.symbols.some((s) => MAJOR_COINS.has(s))) score += 8;
  if (event.symbols.some((s) => config.watchlist.some((w) => w.symbol.toUpperCase() === s))) score += 10;
  if (/official|binance|sec/i.test(event.source)) score += 5;

  return Math.max(0, Math.min(99, score));
}

function confidenceFrom(event) {
  let confidence = 52;
  if (event.sourceType === 'binance' || event.sourceType === 'sec') confidence += 24;
  if (event.symbols.length) confidence += 10;
  if (event.type !== 'other') confidence += 8;
  return Math.max(0, Math.min(98, confidence));
}

function normalizeEvent(partial) {
  const title = cleanText(partial.title);
  const body = cleanText(partial.body || '');
  const type = inferEventType(`${title} ${body}`);
  const symbols = extractSymbols(`${title} ${body}`);
  const publishedAt = partial.publishedAt || new Date().toISOString();
  const source = partial.source || 'Bilinmeyen kaynak';
  const sourceType = partial.sourceType || 'media';
  const url = partial.url || '#';
  const id = crypto.createHash('sha1').update(`${source}|${title}|${url}`).digest('hex');
  const impact = computeImpactDirection(type, symbols);
  const score = computeScore({ sourceType, type, symbols, source });
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

async function scrapeBinancePage(url, sourceLabel) {
  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const $ = cheerio.load(data);
  const events = [];
  $('a[href*="/support/announcement/detail/"]').each((_, el) => {
    const title = cleanText($(el).text());
    const href = $(el).attr('href');
    if (!title || !href) return;
    const rowText = cleanText($(el).closest('div, li, a').text());
    const fullUrl = href.startsWith('http') ? href : `https://www.binance.com${href}`;
    events.push(normalizeEvent({
      title,
      body: rowText,
      source: sourceLabel,
      sourceType: 'binance',
      url: fullUrl
    }));
  });
  return uniqBy(events, (e) => e.id).slice(0, 25);
}

async function scrapeSecPressReleases() {
  const { data } = await axios.get('https://www.sec.gov/newsroom/press-releases', {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const $ = cheerio.load(data);
  const events = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.includes('/newsroom/press-releases/')) return;
    const title = cleanText($(el).text());
    if (!title) return;
    const wrapperText = cleanText($(el).closest('article, li, div').text());
    const url = href.startsWith('http') ? href : `https://www.sec.gov${href}`;
    events.push(normalizeEvent({
      title,
      body: wrapperText,
      source: 'SEC Basın Açıklamaları',
      sourceType: 'sec',
      url
    }));
  });
  return uniqBy(events, (e) => e.id).slice(0, 25);
}

async function fetchRssSource(source) {
  const feed = await parser.parseURL(source.url);
  const items = (feed.items || []).slice(0, source.limit || 10);
  return items.map((item) => normalizeEvent({
    title: item.title,
    body: item.contentSnippet || item.content || item.summary || '',
    source: source.name,
    sourceType: source.sourceType || 'project',
    url: item.link,
    publishedAt: item.isoDate || item.pubDate || new Date().toISOString()
  }));
}

const DEFAULT_RSS_SOURCES = [
  {
    name: 'SEC RSS',
    url: 'https://www.sec.gov/rss/news/press.xml',
    sourceType: 'sec',
    limit: 10
  }
];

async function fetchAllRawEvents() {
  const tasks = [
    scrapeBinancePage('https://www.binance.com/en-BH/support/announcement', 'Binance Resmi Duyurular'),
    scrapeBinancePage('https://www.binance.com/en/support/announcement/list/161', 'Binance Delisting'),
    scrapeSecPressReleases(),
    ...DEFAULT_RSS_SOURCES.map((source) => fetchRssSource(source).catch(() => [])),
    ...config.customProjectSources.map((source) => fetchRssSource(source).catch(() => []))
  ];

  const results = await Promise.allSettled(tasks);
  const merged = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      merged.push(...result.value);
    }
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
  const watch = new Set(config.watchlist.map((w) => w.symbol.toUpperCase()));
  return event.symbols.some((s) => watch.has(s));
}

function eventToTurkishSummary(event) {
  const symbolText = event.symbols.length ? ` | Coin: ${event.symbols.join(', ')}` : '';
  return `${event.source} kaynakli ${event.type} olayi.${symbolText} Ilk etki: ${event.impact}.`; 
}

module.exports = {
  fetchAllRawEvents,
  normalizeEvent,
  matchesWatchlist,
  eventToTurkishSummary
};
