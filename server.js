const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./lib/config');
const { readJson, writeJson } = require('./lib/store');
const { fetchAllRawEvents, matchesWatchlist } = require('./lib/event-engine');
const { enrichWithAI } = require('./lib/ai');
const { fetchMarketSnapshot, fetchCoinsMarketPage } = require('./lib/market');
const { tokenForPassword, isAuthed, requireAuth } = require('./lib/auth');
const { setupWebPush, addSubscription, pushToAll, loadSubscriptions } = require('./lib/push');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/public', express.static('public'));
app.use('/data', express.static('data'));

const pushEnabled = setupWebPush();
let events = readJson(config.eventsFile, []);
let lastNotifiedIds = new Set();
let refreshing = false;

function htmlFile(res, file) {
  return res.sendFile(file, { root: __dirname + '/public' });
}

app.get('/', (req, res) => {
  if (!isAuthed(req)) return htmlFile(res, 'login.html');
  return htmlFile(res, 'index.html');
});

app.get('/sw.js', (req, res) => htmlFile(res, 'sw.js'));
app.get('/manifest.webmanifest', (req, res) => htmlFile(res, 'manifest.webmanifest'));

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== config.appPassword) {
    return res.status(401).json({ ok: false, error: 'Åifre yanlÄ±Å.' });
  }
  res.cookie('cet_session', tokenForPassword(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
  return res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('cet_session');
  return res.json({ ok: true });
});

app.get('/api/status', (_req, res) => {
  return res.json({
    ok: true,
    authed: true,
    pushEnabled,
    vapidPublicKey: config.vapidPublicKey || '',
    minScoreToNotify: config.minScoreToNotify,
    pollIntervalMs: config.pollIntervalMs,
    autoRefreshMs: 30000,
    marketAutoRefreshMs: 20000
  });
});

app.use('/api', requireAuth);

app.get('/api/events', (req, res) => {
  const minScore = Number(req.query.minScore || 0);
  const onlyWatchlist = String(req.query.onlyWatchlist || 'false') === 'true';
  const type = String(req.query.type || '').trim();
  const query = String(req.query.query || '').trim().toLowerCase();

  let filtered = [...events];
  if (minScore > 0) filtered = filtered.filter((e) => e.score >= minScore);
  if (onlyWatchlist) filtered = filtered.filter(matchesWatchlist);
  if (type) filtered = filtered.filter((e) => e.type === type);
  if (query) {
    filtered = filtered.filter((e) => {
      const hay = `${e.title} ${e.body} ${e.source} ${(e.symbols || []).join(' ')}`.toLowerCase();
      return hay.includes(query);
    });
  }
  return res.json({ ok: true, events: filtered.slice(0, 120) });
});

app.get('/api/watchlist', async (_req, res) => {
  const watchlist = await fetchMarketSnapshot();
  return res.json({ ok: true, watchlist });
});

app.get('/api/markets', async (req, res) => {
  const page = Number(req.query.page || 1);
  const perPage = Number(req.query.perPage || 100);
  const query = String(req.query.query || '').trim();
  const result = await fetchCoinsMarketPage({ page, perPage, query });
  return res.json({ ok: true, ...result });
});

app.post('/api/refresh', async (_req, res) => {
  await refreshEvents(false);
  return res.json({ ok: true, count: events.length });
});

app.get('/api/settings', (_req, res) => {
  return res.json({
    ok: true,
    pushEnabled,
    subscribers: loadSubscriptions().length,
    watchlist: config.watchlist,
    pollIntervalMs: config.pollIntervalMs,
    minScoreToNotify: config.minScoreToNotify,
    aiEnabled: Boolean(config.deepseekApiKey)
  });
});

app.post('/api/push/subscribe', (req, res) => {
  if (!pushEnabled) return res.status(400).json({ ok: false, error: 'Web Push iÃ§in VAPID anahtarlarÄ± eksik.' });
  const subscription = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ ok: false, error: 'Abonelik verisi eksik.' });
  const total = addSubscription(subscription);
  return res.json({ ok: true, total });
});

app.post('/api/push/test', async (_req, res) => {
  if (!pushEnabled) return res.status(400).json({ ok: false, error: 'Web Push kapalÄ±.' });
  const result = await pushToAll({
    title: 'Test Bildirimi',
    body: 'Kripto event terminali hazÄ±r. ArtÄ±k gerÃ§ek alarmlar gelebilir.',
    url: '/',
    tag: 'test-bildirim'
  });
  return res.json({ ok: true, result });
});

async function refreshEvents(notifyNew = true) {
  if (refreshing) return;
  refreshing = true;
  try {
    const rawEvents = await fetchAllRawEvents();
    const enriched = [];
    for (const event of rawEvents.slice(0, 60)) {
      enriched.push(await enrichWithAI(event));
    }
    events = enriched.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));
    writeJson(config.eventsFile, events);

    if (notifyNew && pushEnabled) {
      const candidates = events.filter((event) => {
        if (lastNotifiedIds.has(event.id)) return false;
        if (event.score < config.minScoreToNotify) return false;
        if (!matchesWatchlist(event) && event.score < 85) return false;
        return true;
      }).slice(0, 3);

      for (const event of candidates) {
        await pushToAll({
          title: `${event.impact.toUpperCase()} | ${event.score}/99 | ${event.type}`,
          body: event.aiSummary || event.title,
          url: event.url,
          tag: event.id,
          eventId: event.id
        });
        lastNotifiedIds.add(event.id);
      }
    }
  } catch (error) {
    console.error('refreshEvents error', error.message);
  } finally {
    refreshing = false;
  }
}

setInterval(() => {
  refreshEvents(true).catch((error) => console.error(error));
}, config.pollIntervalMs);

refreshEvents(false).catch((error) => console.error(error));

app.listen(config.port, () => {
  console.log(`Crypto event terminal http://localhost:${config.port}`);
});
