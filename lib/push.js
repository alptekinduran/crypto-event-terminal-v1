const webpush = require('web-push');
const config = require('./config');
const { readJson, writeJson } = require('./store');

function setupWebPush() {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  return true;
}

function loadSubscriptions() {
  return readJson(config.subsFile, []);
}

function saveSubscriptions(subscriptions) {
  writeJson(config.subsFile, subscriptions);
}

function addSubscription(subscription) {
  const existing = loadSubscriptions();
  const merged = [subscription, ...existing.filter((s) => s.endpoint !== subscription.endpoint)];
  saveSubscriptions(merged);
  return merged.length;
}

async function pushToAll(payload) {
  const subs = loadSubscriptions();
  if (!subs.length) return { sent: 0, removed: 0 };
  let sent = 0;
  let removed = 0;
  const kept = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sent += 1;
      kept.push(sub);
    } catch (error) {
      const status = error?.statusCode;
      if (status !== 404 && status !== 410) kept.push(sub);
      else removed += 1;
    }
  }
  saveSubscriptions(kept);
  return { sent, removed };
}

module.exports = {
  setupWebPush,
  addSubscription,
  pushToAll,
  loadSubscriptions
};
