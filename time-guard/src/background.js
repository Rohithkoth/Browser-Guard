// Time Guard service worker: counts time on tracked sites, sends tabs to the
// block page at the limit, and is the only code that changes stored data
// (pages ask it through messages), so updates never race each other.
importScripts('shared/totp.js', 'shared/limits.js');
const TG = globalThis.TimeGuard;

const TICK_MINUTES = 0.5;
// The longest gap credited in one go. Alarms fire every 30 s while Chrome runs,
// so a bigger gap means the computer slept; that time isn't counted.
const MAX_GAP_MS = 90 * 1000;
const MAX_FAILED_CODES = 5;
const LOCKOUT_MS = 2 * 60 * 1000;
const BLOCK_PAGE = chrome.runtime.getURL('src/blocked/blocked.html');

const DEFAULT_CONFIG = { sites: [], overallCapMin: null, paused: false };

// ---- one-at-a-time queue: every read-modify-write of storage goes through it ----
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task, task);
  queue = run.catch((err) => console.error('[Time Guard]', err));
  return run;
}

async function load() {
  const stored = await chrome.storage.local.get(['config', 'usage', 'totp', 'pending', 'attempts']);
  const now = Date.now();
  return {
    config: { ...DEFAULT_CONFIG, ...stored.config },
    usage: TG.currentUsage(stored.usage, now),
    totp: stored.totp || null,
    pending: stored.pending || null,
    attempts: stored.attempts || { count: 0, lockedUntil: 0 },
    now,
  };
}

// ---- what's in use right now ----
// A tracked site counts while it's the active tab of the focused Chrome window,
// or while one of its tabs is playing sound (a video on a second screen).
// Nothing counts while the computer is locked.
async function sitesInUse(config) {
  if (!config.sites.length) return [];
  if ((await chrome.idle.queryState(60)) === 'locked') return [];
  const domains = new Set();
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (win && win.focused) {
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    const site = tab && TG.siteForUrl(tab.url, config.sites);
    if (site) domains.add(site);
  }
  for (const tab of await chrome.tabs.query({ audible: true })) {
    const site = TG.siteForUrl(tab.url, config.sites);
    if (site) domains.add(site);
  }
  return [...domains];
}

function blockUrl(site, fromUrl, incognito) {
  const params = new URLSearchParams({ site });
  // An Incognito address isn't carried into a normal window.
  if (fromUrl && !incognito) params.set('from', fromUrl);
  return `${BLOCK_PAGE}?${params}`;
}

async function enforce(config, usage) {
  if (config.paused) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const site = TG.siteForUrl(tab.url || tab.pendingUrl, config.sites);
    if (!site || !TG.isBlocked(site, config, usage)) continue;
    const target = blockUrl(site, tab.url, tab.incognito);
    if (tab.incognito) {
      // Extension pages can't load in Incognito tabs, so close the tab and show
      // the block page in a normal window.
      await chrome.tabs.remove(tab.id).catch(() => {});
      const normal = (await chrome.windows.getAll({ windowTypes: ['normal'] })).find((w) => !w.incognito);
      if (normal) await chrome.tabs.create({ windowId: normal.id, url: target });
      else await chrome.windows.create({ url: target });
    } else {
      await chrome.tabs.update(tab.id, { url: target }).catch(() => {});
    }
  }
}

// The core loop: credit time since the last check, recompute what's in use,
// block what's over, and schedule the next check.
async function reconcile() {
  const { config, usage: today, now } = await load();
  const { tracking } = await chrome.storage.session.get('tracking');
  let usage = today;

  if (tracking && tracking.since && tracking.domains.length) {
    // Only time after midnight counts toward today.
    const start = Math.max(tracking.since, new Date(new Date(now).setHours(0, 0, 0, 0)).getTime());
    const elapsed = Math.min(Math.max(0, now - start), MAX_GAP_MS);
    const stillTracked = tracking.domains.filter((d) => config.sites.some((s) => s.domain === d));
    usage = TG.applyElapsed(usage, config, stillTracked, elapsed);
  }

  const active = config.paused ? [] : (await sitesInUse(config)).filter((d) => !TG.isBlocked(d, config, usage));
  await chrome.storage.local.set({ usage });
  await chrome.storage.session.set({ tracking: { domains: active, since: now } });
  await enforce(config, usage);

  // Wake up exactly when the next site runs out, and at midnight for the reset.
  const untilBlock = TG.msUntilNextBlock(active, config, usage);
  if (Number.isFinite(untilBlock)) chrome.alarms.create('limit', { when: now + Math.max(untilBlock, 1000) });
  else chrome.alarms.clear('limit');
  chrome.alarms.create('reset', { when: TG.nextReset(now) + 1000 });
}

const refresh = () => serial(reconcile);

// ---- codes ----
async function checkCode(state, code) {
  const { totp, attempts, now } = state;
  if (!totp) return { error: 'Time Guard isn\'t set up yet.' };
  if (attempts.lockedUntil > now) {
    return { error: `Too many wrong codes. Try again in ${Math.ceil((attempts.lockedUntil - now) / 1000)} s.` };
  }
  const counter = await TG.verifyCode(totp.secret, code, now, totp.lastCounter ?? -1);
  if (counter === null) {
    const count = attempts.count + 1;
    const locked = count >= MAX_FAILED_CODES;
    await chrome.storage.local.set({ attempts: { count: locked ? 0 : count, lockedUntil: locked ? now + LOCKOUT_MS : 0 } });
    return { error: locked ? 'Too many wrong codes. Locked for 2 minutes.' : 'That code isn\'t right. Check your authenticator app.' };
  }
  await chrome.storage.local.set({ totp: { ...totp, lastCounter: counter }, attempts: { count: 0, lockedUntil: 0 } });
  return { ok: true };
}

// ---- messages from the extension's pages ----
const handlers = {
  async status() {
    const s = await load();
    return { config: s.config, usage: s.usage, setUp: Boolean(s.totp), now: s.now, nextReset: TG.nextReset(s.now) };
  },

  async unlock({ site, code, choice }) {
    const state = await load();
    if (!state.config.sites.some((s) => s.domain === site)) return { error: 'That site isn\'t limited.' };
    if (!(choice in TG.GRANTS)) return { error: 'Pick how long to unlock for.' };
    const check = await checkCode(state, code);
    if (!check.ok) return check;
    await chrome.storage.local.set({ usage: TG.applyGrant(state.usage, site, choice) });
    await reconcile();
    return { ok: true };
  },

  async saveConfig({ config: input, code }) {
    const state = await load();
    if (!state.totp) return { error: 'Set up your authenticator first.' };
    const { errors, config } = TG.validateConfig(input);
    if (errors.length) return { errors };
    const loosening = TG.looseningChanges(state.config, config);
    if (loosening.length) {
      if (!code) return { needCode: loosening };
      const check = await checkCode(state, code);
      if (!check.ok) return { ...check, needCode: loosening };
    }
    await chrome.storage.local.set({ config });
    await reconcile();
    return { ok: true };
  },

  // Starts setup, or replacing the authenticator (which needs a current code).
  async setupBegin({ code }) {
    const state = await load();
    if (state.totp) {
      const check = await checkCode(state, code);
      if (!check.ok) return check;
    }
    // First-time setup reopened before it was finished: keep the same key, so
    // an entry already scanned into the phone still works.
    if (!state.totp && state.pending) return { secret: state.pending.secret, uri: TG.otpauthUri(state.pending.secret) };
    const secret = TG.generateSecret();
    await chrome.storage.local.set({ pending: { secret, createdAt: state.now } });
    return { secret, uri: TG.otpauthUri(secret) };
  },

  // Finishes setup once a code from the new authenticator entry checks out.
  // The key is never shown again after this.
  async setupConfirm({ code }) {
    const state = await load();
    if (!state.pending) return { error: 'Start setup again.' };
    const counter = await TG.verifyCode(state.pending.secret, code, state.now);
    if (counter === null) return { error: 'That code doesn\'t match. Make sure you scanned the code shown here, then try the newest code.' };
    await chrome.storage.local.set({ totp: { secret: state.pending.secret, lastCounter: counter, createdAt: state.now } });
    await chrome.storage.local.remove('pending');
    return { ok: true };
  },

  async setupCancel() {
    await chrome.storage.local.remove('pending');
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only the extension's own pages may send commands.
  if (sender.id !== chrome.runtime.id || (sender.url && !sender.url.startsWith(chrome.runtime.getURL('')))) return false;
  const handler = handlers[message && message.type];
  if (!handler) return false;
  serial(() => handler(message)).then(sendResponse, (err) => sendResponse({ error: String(err.message || err) }));
  return true;
});

// ---- events that can change what's in use ----
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onRemoved.addListener(refresh);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url || change.audible !== undefined || change.status === 'loading') refresh();
});
chrome.windows.onFocusChanged.addListener(refresh);
chrome.idle.onStateChanged.addListener(refresh);
chrome.alarms.onAlarm.addListener(refresh);

function startTicking() {
  chrome.alarms.create('tick', { periodInMinutes: TICK_MINUTES });
  refresh();
}
chrome.runtime.onStartup.addListener(startTicking);
chrome.runtime.onInstalled.addListener(async (details) => {
  startTicking();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
