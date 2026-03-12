const axios = require('axios');
const config = require('./config');

const BASE_URL = config.coingeckoApiKey
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

function headers() {
  return config.coingeckoApiKey
    ? { 'x-cg-pro-api-key': config.coingeckoApiKey }
    : {};
}

function normalizeCoin(item) {
  return {
    id: item.id,
    symbol: String(item.symbol || '').toUpperCase(),
    name: item.name,
    image: item.image || '',
    priceUsd: item.current_price ?? null,
    change24h: item.price_change_percentage_24h ?? null,
    marketCap: item.market_cap ?? null,
    volume24h: item.total_volume ?? null,
    rank: item.market_cap_rank ?? null,
    lastUpdatedAt: item.last_updated || null
  };
}

async function fetchCoinsMarketPage({ page = 1, perPage = 100, query = '' } = {}) {
  const cleanPage = Math.max(1, Number(page) || 1);
  const cleanPerPage = Math.min(250, Math.max(10, Number(perPage) || 100));
  const cleanQuery = String(query || '').trim();

  try {
    if (!cleanQuery) {
      const response = await axios.get(`${BASE_URL}/coins/markets`, {
        timeout: 20000,
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: cleanPerPage,
          page: cleanPage,
          sparkline: false,
          price_change_percentage: '24h'
        },
        headers: headers()
      });

      return {
        items: (response.data || []).map(normalizeCoin),
        page: cleanPage,
        perPage: cleanPerPage,
        query: '',
        mode: 'markets'
      };
    }

    const searchResponse = await axios.get(`${BASE_URL}/search`, {
      timeout: 20000,
      params: { query: cleanQuery },
      headers: headers()
    });

    const coins = (searchResponse.data?.coins || []).slice(0, cleanPerPage);
    const ids = coins.map((c) => c.id).filter(Boolean);
    if (!ids.length) {
      return { items: [], page: 1, perPage: cleanPerPage, query: cleanQuery, mode: 'search' };
    }

    const marketResponse = await axios.get(`${BASE_URL}/coins/markets`, {
      timeout: 20000,
      params: {
        vs_currency: 'usd',
        ids: ids.join(','),
        order: 'market_cap_desc',
        per_page: ids.length,
        page: 1,
        sparkline: false,
        price_change_percentage: '24h'
      },
      headers: headers()
    });

    const marketMap = new Map((marketResponse.data || []).map((item) => [item.id, item]));
    const items = ids
      .map((id) => marketMap.get(id))
      .filter(Boolean)
      .map(normalizeCoin);

    return {
      items,
      page: 1,
      perPage: cleanPerPage,
      query: cleanQuery,
      mode: 'search'
    };
  } catch {
    return {
      items: [],
      page: cleanPage,
      perPage: cleanPerPage,
      query: cleanQuery,
      mode: cleanQuery ? 'search' : 'markets'
    };
  }
}

async function fetchMarketSnapshot() {
  if (!config.watchlist.length) return [];
  const ids = config.watchlist.map((x) => x.coingeckoId).filter(Boolean);
  if (!ids.length) return [];

  try {
    const response = await axios.get(`${BASE_URL}/coins/markets`, {
      timeout: 15000,
      params: {
        vs_currency: 'usd',
        ids: ids.join(','),
        order: 'market_cap_desc',
        per_page: ids.length,
        page: 1,
        sparkline: false,
        price_change_percentage: '24h'
      },
      headers: headers()
    });

    const marketMap = new Map((response.data || []).map((item) => [item.id, item]));
    return config.watchlist.map((item) => {
      const found = marketMap.get(item.coingeckoId);
      return {
        ...item,
        image: found?.image || '',
        priceUsd: found?.current_price ?? null,
        change24h: found?.price_change_percentage_24h ?? null,
        marketCap: found?.market_cap ?? null,
        volume24h: found?.total_volume ?? null,
        rank: found?.market_cap_rank ?? null,
        lastUpdatedAt: found?.last_updated || null
      };
    });
  } catch {
    return config.watchlist.map((item) => ({
      ...item,
      image: '',
      priceUsd: null,
      change24h: null,
      marketCap: null,
      volume24h: null,
      rank: null,
      lastUpdatedAt: null
    }));
  }
}

module.exports = { fetchMarketSnapshot, fetchCoinsMarketPage };
