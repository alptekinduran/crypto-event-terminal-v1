const axios = require('axios');
const config = require('./config');

async function fetchMarketSnapshot() {
  if (!config.watchlist.length) return [];

  const ids = config.watchlist.map((x) => x.coingeckoId).filter(Boolean);
  if (!ids.length) return [];

  const baseUrl = config.coingeckoApiKey
    ? 'https://pro-api.coingecko.com/api/v3/simple/price'
    : 'https://api.coingecko.com/api/v3/simple/price';

  try {
    const response = await axios.get(baseUrl, {
      timeout: 15000,
      params: {
        ids: ids.join(','),
        vs_currencies: 'usd',
        include_24hr_change: true,
        include_last_updated_at: true
      },
      headers: config.coingeckoApiKey
        ? { 'x-cg-pro-api-key': config.coingeckoApiKey }
        : {}
    });

    return config.watchlist.map((item) => ({
      ...item,
      priceUsd: response.data?.[item.coingeckoId]?.usd ?? null,
      change24h: response.data?.[item.coingeckoId]?.usd_24h_change ?? null,
      lastUpdatedAt: response.data?.[item.coingeckoId]?.last_updated_at ?? null
    }));
  } catch {
    return config.watchlist.map((item) => ({ ...item, priceUsd: null, change24h: null, lastUpdatedAt: null }));
  }
}

module.exports = { fetchMarketSnapshot };
