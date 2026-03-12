let vapidPublicKey = '';
let eventTimer = null;
let marketTimer = null;
let marketPage = 1;
let marketPerPage = 100;
let lastMarketQuery = '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'İstek başarısız.');
  return data;
}

function chip(label, kind = 'neutral') {
  return `<span class="chip ${kind}">${label}</span>`;
}

function impactKind(impact) {
  if ((impact || '').includes('pozitif')) return 'positive';
  if ((impact || '').includes('negatif')) return 'negative';
  return 'neutral';
}

function fmtDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Zaman yok';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function fmtUsd(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', maximumFractionDigits: value > 1 ? 2 : 6 }).format(value);
}

function debounce(fn, wait = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

async function loadStatus() {
  const status = await fetchJson('/api/status');
  vapidPublicKey = status.vapidPublicKey;
}

async function loadWatchlist() {
  const { watchlist } = await fetchJson('/api/watchlist');
  const container = document.getElementById('watchlist');
  document.getElementById('marketStatus').textContent = `${watchlist.length} varlık • otomatik`; 
  if (!watchlist.length) {
    container.innerHTML = '<div class="empty">Takip listesi boş.</div>';
    return;
  }
  container.innerHTML = watchlist.map((item) => {
    const changeClass = (item.change24h || 0) >= 0 ? 'up' : 'down';
    const changeLabel = item.change24h === null ? '—' : `${item.change24h.toFixed(2)}%`;
    return `
      <article class="watch-card">
        <div class="muted">${item.name}</div>
        <strong>${item.symbol}</strong>
        <div class="price">${fmtUsd(item.priceUsd)}</div>
        <div class="${changeClass}">${changeLabel}</div>
      </article>
    `;
  }).join('');
}

async function loadAllCoins() {
  const query = document.getElementById('marketSearchInput').value.trim();
  const params = new URLSearchParams({
    page: String(marketPage),
    perPage: String(marketPerPage),
    query
  });
  const data = await fetchJson(`/api/markets?${params.toString()}`);
  const container = document.getElementById('allCoins');
  const status = document.getElementById('marketBrowserStatus');
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  lastMarketQuery = query;
  status.textContent = query
    ? `Arama sonucu: ${data.items.length} coin`
    : `${data.items.length} coin gösteriliyor`;
  pageInfo.textContent = query ? 'Arama modu' : `Sayfa ${data.page}`;
  prevBtn.disabled = !!query || data.page <= 1;
  nextBtn.disabled = !!query || data.items.length < marketPerPage;

  if (!data.items.length) {
    container.innerHTML = '<div class="empty">Coin bulunamadı.</div>';
    return;
  }

  container.innerHTML = data.items.map((coin) => {
    const changeClass = (coin.change24h || 0) >= 0 ? 'up' : 'down';
    const changeLabel = coin.change24h === null ? '—' : `${coin.change24h.toFixed(2)}%`;
    const image = coin.image ? `<img class="coin-avatar" src="${coin.image}" alt="${coin.symbol}">` : '<div class="coin-avatar coin-avatar-fallback"></div>';
    return `
      <article class="coin-row">
        <div class="coin-main">
          ${image}
          <div>
            <div class="coin-name">${coin.name}</div>
            <div class="small muted">${coin.symbol} • #${coin.rank || '—'}</div>
          </div>
        </div>
        <div class="coin-metrics">
          <strong>${fmtUsd(coin.priceUsd)}</strong>
          <span class="${changeClass}">${changeLabel}</span>
        </div>
      </article>
    `;
  }).join('');
}

async function loadEvents() {
  const minScore = document.getElementById('minScoreInput').value;
  const onlyWatchlist = document.getElementById('onlyWatchlistCheckbox').checked;
  const type = document.getElementById('typeSelect').value;
  const query = document.getElementById('eventSearchInput').value.trim();
  document.getElementById('feedStatus').textContent = 'Yükleniyor...';
  const params = new URLSearchParams({ minScore, onlyWatchlist, type, query });
  const { events } = await fetchJson(`/api/events?${params.toString()}`);
  const container = document.getElementById('events');
  document.getElementById('feedStatus').textContent = `${events.length} olay`;
  if (!events.length) {
    container.innerHTML = '<div class="empty">Filtrelere uygun olay bulunamadı.</div>';
    return;
  }
  const tpl = document.getElementById('eventCardTemplate');
  container.innerHTML = '';
  for (const event of events) {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.event-title').textContent = event.title;
    node.querySelector('.event-summary').textContent = event.aiSummary || event.title;
    node.querySelector('.event-reason').textContent = event.aiReason || '';
    const link = node.querySelector('.event-link');
    link.href = event.url;
    const chips = [
      chip(`${event.score}/99`, impactKind(event.impact)),
      chip(event.type, 'neutral'),
      chip(event.impact, impactKind(event.impact)),
      chip(`güven ${event.confidence}/98`, 'neutral')
    ];
    for (const symbol of event.symbols || []) chips.push(chip(symbol, 'neutral'));
    node.querySelector('.chips').innerHTML = chips.join('');
    node.querySelector('.event-meta').innerHTML = `
      <span class="muted">${event.source}</span>
      <span class="muted">${fmtDate(event.publishedAt)}</span>
    `;
    container.appendChild(node);
  }
}

async function refreshNow() {
  document.getElementById('feedStatus').textContent = 'Yenileniyor...';
  await fetchJson('/api/refresh', { method: 'POST' });
  await Promise.all([loadWatchlist(), loadAllCoins(), loadEvents()]);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js');
}

async function enablePush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Bu tarayıcıda push desteği görünmüyor. iPhone için siteyi Ana Ekrana ekleyip oradan açman gerekir.');
    return;
  }
  if (!vapidPublicKey) {
    alert('VAPID anahtarları henüz ayarlanmamış. Önce Replit secrets eklenmeli.');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Bildirim izni verilmedi.');
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
  await fetchJson('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub)
  });
  alert('Bildirimler açıldı.');
}

async function testPush() {
  const { result } = await fetchJson('/api/push/test', { method: 'POST' });
  alert(`Test gönderildi. Başarılı: ${result.sent}, silinen abonelik: ${result.removed}`);
}

async function logout() {
  await fetchJson('/api/logout', { method: 'POST' });
  location.href = '/';
}

function bindEvents() {
  const minScoreInput = document.getElementById('minScoreInput');
  const minScoreValue = document.getElementById('minScoreValue');
  const marketSearchInput = document.getElementById('marketSearchInput');
  const eventSearchInput = document.getElementById('eventSearchInput');

  minScoreInput.addEventListener('input', () => {
    minScoreValue.textContent = minScoreInput.value;
  });
  minScoreInput.addEventListener('change', loadEvents);
  document.getElementById('typeSelect').addEventListener('change', loadEvents);
  document.getElementById('onlyWatchlistCheckbox').addEventListener('change', loadEvents);
  document.getElementById('refreshBtn').addEventListener('click', refreshNow);
  document.getElementById('enablePushBtn').addEventListener('click', enablePush);
  document.getElementById('testPushBtn').addEventListener('click', testPush);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  marketSearchInput.addEventListener('input', debounce(() => {
    marketPage = 1;
    loadAllCoins();
  }, 500));
  eventSearchInput.addEventListener('input', debounce(loadEvents, 400));
  document.getElementById('marketPerPageSelect').addEventListener('change', (e) => {
    marketPerPage = Number(e.target.value || 100);
    marketPage = 1;
    loadAllCoins();
  });
  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (marketPage > 1) {
      marketPage -= 1;
      loadAllCoins();
    }
  });
  document.getElementById('nextPageBtn').addEventListener('click', () => {
    marketPage += 1;
    loadAllCoins();
  });
}

function startAutoRefresh() {
  clearInterval(eventTimer);
  clearInterval(marketTimer);
  eventTimer = setInterval(() => {
    loadEvents().catch(() => {});
  }, 30000);
  marketTimer = setInterval(() => {
    Promise.all([loadWatchlist(), loadAllCoins()]).catch(() => {});
  }, 20000);
}

window.addEventListener('load', async () => {
  try {
    await registerServiceWorker();
    bindEvents();
    await loadStatus();
    await Promise.all([loadWatchlist(), loadAllCoins(), loadEvents()]);
    startAutoRefresh();
  } catch (error) {
    document.getElementById('feedStatus').textContent = error.message;
  }
});
