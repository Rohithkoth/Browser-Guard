// A small in-memory stand-in for the Chrome APIs background.js uses, with a
// controllable clock, so the real service worker can be driven from tests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function event() {
  const listeners = [];
  return { addListener: (fn) => listeners.push(fn), listeners, fire: (...args) => listeners.map((fn) => fn(...args)) };
}

function area() {
  let data = {};
  return {
    get data() { return data; },
    async get(keys) {
      const pick = (k) => (k in data ? { [k]: structuredClone(data[k]) } : {});
      if (keys == null) return structuredClone(data);
      if (typeof keys === 'string') return pick(keys);
      if (Array.isArray(keys)) return Object.assign({}, ...keys.map(pick));
      return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in data ? structuredClone(data[k]) : d]));
    },
    async set(values) { data = { ...data, ...structuredClone(values) }; },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
  };
}

function createBrowser(startMs) {
  let now = startMs;
  let nextTabId = 1;
  const EXT = 'chrome-extension://timeguard/';
  const state = {
    windows: [{ id: 1, focused: true, incognito: false, type: 'normal' }],
    tabs: [],
    idle: 'active',
    alarms: new Map(),
    created: [],
    removed: [],
    optionsOpened: 0,
  };

  const chrome = {
    runtime: {
      id: 'timeguard',
      getURL: (p) => EXT + p,
      onMessage: event(),
      onStartup: event(),
      onInstalled: event(),
      openOptionsPage: () => { state.optionsOpened++; },
    },
    storage: { local: area(), session: area() },
    alarms: {
      create: (name, info) => {
        state.alarms.set(name, { name, when: info.when ?? now + info.periodInMinutes * 60000, period: info.periodInMinutes });
      },
      clear: async (name) => state.alarms.delete(name),
      onAlarm: event(),
    },
    idle: { queryState: async () => state.idle, onStateChanged: event() },
    windows: {
      getLastFocused: async () => {
        const w = state.windows.find((x) => x.focused) || state.windows[0];
        return { ...w, focused: Boolean(w && w.focused && !state.chromeUnfocused) };
      },
      getAll: async () => state.windows.map((w) => ({ ...w })),
      create: async ({ url }) => {
        const w = { id: 100 + state.windows.length, focused: false, incognito: false, type: 'normal' };
        state.windows.push(w);
        return chrome.tabs.create({ windowId: w.id, url });
      },
      onFocusChanged: event(),
    },
    tabs: {
      query: async (q) => state.tabs
        .filter((t) => (q.active === undefined || t.active === q.active)
          && (q.windowId === undefined || t.windowId === q.windowId)
          && (q.audible === undefined || Boolean(t.audible) === q.audible))
        .map((t) => ({ ...t, incognito: state.windows.find((w) => w.id === t.windowId).incognito })),
      update: async (id, { url }) => { const t = state.tabs.find((x) => x.id === id); if (t) t.url = url; return t; },
      remove: async (id) => { state.removed.push(id); state.tabs = state.tabs.filter((t) => t.id !== id); },
      create: async ({ windowId, url }) => {
        const tab = { id: nextTabId++, windowId: windowId ?? 1, url, active: false };
        state.tabs.push(tab);
        state.created.push(tab);
        return tab;
      },
      onActivated: event(),
      onRemoved: event(),
      onUpdated: event(),
    },
  };

  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }

  const context = vm.createContext({
    chrome, Date: FakeDate, URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto,
    console, structuredClone, Uint8Array, setTimeout, Promise,
  });
  context.globalThis = context;
  const dir = path.join(__dirname, '..', 'src');
  context.importScripts = (...files) => {
    for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), context, { filename: f });
  };
  vm.runInContext(fs.readFileSync(path.join(dir, 'background.js'), 'utf8'), context, { filename: 'background.js' });

  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

  const browser = {
    chrome,
    state,
    TG: context.TimeGuard,
    get now() { return now; },
    async install() { chrome.runtime.onInstalled.fire({ reason: 'install' }); await settle(); },
    // Moves the clock forward, firing alarms that come due along the way, the
    // way Chrome would (each alarm fires at most once per step).
    async advance(ms, { asleep = false } = {}) {
      const end = now + ms;
      while (true) {
        const due = [...state.alarms.values()].filter((a) => a.when <= end).sort((a, b) => a.when - b.when)[0];
        if (!due || asleep) break;
        now = Math.max(now, due.when);
        if (due.period) due.when = now + due.period * 60000; else state.alarms.delete(due.name);
        chrome.alarms.onAlarm.fire({ name: due.name });
        await settle();
      }
      now = end;
      if (asleep) { chrome.alarms.onAlarm.fire({ name: 'tick' }); await settle(); }
    },
    async send(message, sender = { id: 'timeguard', url: 'chrome-extension://timeguard/src/options/options.html' }) {
      let resolve;
      const replied = new Promise((r) => { resolve = r; });
      const handled = chrome.runtime.onMessage.listeners[0](message, sender, resolve);
      if (!handled) return undefined;
      const reply = structuredClone(await replied);
      await settle();
      return reply;
    },
    async openTab(url, { windowId = 1, active = true, audible = false } = {}) {
      if (active) state.tabs.filter((t) => t.windowId === windowId).forEach((t) => { t.active = false; });
      const tab = { id: nextTabId++, windowId, url, active, audible };
      state.tabs.push(tab);
      chrome.tabs.onUpdated.fire(tab.id, { url, status: 'loading' });
      await settle();
      return tab;
    },
    async event(name, ...args) {
      const map = { focus: chrome.windows.onFocusChanged, idle: chrome.idle.onStateChanged, activated: chrome.tabs.onActivated, updated: chrome.tabs.onUpdated };
      map[name].fire(...args);
      await settle();
    },
    tab: (id) => state.tabs.find((t) => t.id === id),
    async local() { return structuredClone(chrome.storage.local.data); },
    // The 6-digit code an authenticator app would show right now.
    async code(secret, offsetSteps = 0) {
      const t = context.TimeGuard;
      return t.hotp(t.base32Decode(secret), t.counterAt(now) + offsetSteps);
    },
  };
  return browser;
}

module.exports = { createBrowser };
