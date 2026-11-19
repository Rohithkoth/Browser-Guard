const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowser } = require('./fake-chrome.js');

const MIN = 60 * 1000;
const START = new Date(2026, 10, 18, 15, 0, 5).getTime();
const BLOCK = 'chrome-extension://timeguard/src/blocked/blocked.html';

// Installs, sets up the authenticator and saves a config. Returns the browser
// and the secret (what the phone app would hold).
async function ready(config = { sites: [{ domain: 'youtube.com', limitMin: 2 }], overallCapMin: null }) {
  const b = createBrowser(START);
  await b.install();
  const begin = await b.send({ type: 'setupBegin' });
  const confirm = await b.send({ type: 'setupConfirm', code: await b.code(begin.secret) });
  assert.deepEqual(confirm, { ok: true });
  await b.advance(30 * 1000); // next code window, so the setup code isn't reused
  const saved = await b.send({ type: 'saveConfig', config });
  assert.deepEqual(saved, { ok: true });
  return { b, secret: begin.secret };
}

test('install opens the settings page; nothing can be limited before setup', async () => {
  const b = createBrowser(START);
  await b.install();
  assert.equal(b.state.optionsOpened, 1);
  const r = await b.send({ type: 'saveConfig', config: { sites: [{ domain: 'youtube.com', limitMin: 5 }] } });
  assert.match(r.error, /Set up your authenticator first/);
  assert.equal((await b.send({ type: 'status' })).setUp, false);
});

test('setup only finishes with a code from the newly scanned key', async () => {
  const b = createBrowser(START);
  await b.install();
  const begin = await b.send({ type: 'setupBegin' });
  assert.match(begin.secret, /^[A-Z2-7]{32}$/);
  assert.match(begin.uri, /^otpauth:\/\/totp\//);
  const wrong = await b.send({ type: 'setupConfirm', code: '000000' });
  assert.match(wrong.error, /doesn't match/);
  assert.equal((await b.send({ type: 'status' })).setUp, false);
  assert.deepEqual(await b.send({ type: 'setupConfirm', code: await b.code(begin.secret) }), { ok: true });
  assert.equal((await b.send({ type: 'status' })).setUp, true);
  // The key isn't exposed by status, and setup can't be restarted without a code.
  assert.doesNotMatch(JSON.stringify(await b.send({ type: 'status' })), new RegExp(begin.secret));
  assert.match((await b.send({ type: 'setupBegin' })).error, /code isn't right/);
});

test('time on the focused tab counts, and the tab is sent to the block page at the limit', async () => {
  const { b } = await ready();
  const tab = await b.openTab('https://www.youtube.com/watch?v=abc');
  await b.advance(1 * MIN);
  let s = await b.send({ type: 'status' });
  assert.ok(Math.abs(s.usage.perSite['youtube.com'] - 1 * MIN) <= 1000, `~1 min counted, got ${s.usage.perSite['youtube.com']}`);
  assert.equal(b.tab(tab.id).url, 'https://www.youtube.com/watch?v=abc');

  await b.advance(1.5 * MIN);
  const url = new URL(b.tab(tab.id).url);
  assert.equal(url.href.split('?')[0], BLOCK);
  assert.equal(url.searchParams.get('site'), 'youtube.com');
  assert.equal(url.searchParams.get('from'), 'https://www.youtube.com/watch?v=abc');

  // Opening the site again goes straight to the block page.
  const again = await b.openTab('https://m.youtube.com/');
  assert.ok(b.tab(again.id).url.startsWith(BLOCK));
  s = await b.send({ type: 'status' });
  assert.ok(s.usage.perSite['youtube.com'] >= 2 * MIN && s.usage.perSite['youtube.com'] < 2.6 * MIN);
});

test('other sites are not counted or blocked', async () => {
  const { b } = await ready();
  const tab = await b.openTab('https://en.wikipedia.org/wiki/Clock');
  await b.advance(10 * MIN);
  const s = await b.send({ type: 'status' });
  assert.equal(s.usage.totalMs, 0);
  assert.equal(b.tab(tab.id).url, 'https://en.wikipedia.org/wiki/Clock');
});

test('a background tab only counts while it is playing sound', async () => {
  const { b } = await ready({ sites: [{ domain: 'youtube.com', limitMin: 60 }] });
  const yt = await b.openTab('https://www.youtube.com/watch?v=abc');
  await b.openTab('https://docs.example.com/'); // now the active tab
  await b.advance(2 * MIN);
  assert.equal((await b.send({ type: 'status' })).usage.totalMs, 0);
  b.tab(yt.id).audible = true;
  await b.event('updated', yt.id, { audible: true });
  await b.advance(2 * MIN);
  const ms = (await b.send({ type: 'status' })).usage.perSite['youtube.com'];
  assert.ok(Math.abs(ms - 2 * MIN) <= 1000, `~2 min counted, got ${ms}`);
});

test('nothing counts while Chrome is in the background or the computer is locked', async () => {
  const { b } = await ready({ sites: [{ domain: 'youtube.com', limitMin: 60 }] });
  await b.openTab('https://www.youtube.com/');
  b.state.chromeUnfocused = true;
  await b.event('focus', -1);
  await b.advance(5 * MIN);
  assert.equal((await b.send({ type: 'status' })).usage.totalMs, 0);
  b.state.chromeUnfocused = false;
  b.state.idle = 'locked';
  await b.event('idle', 'locked');
  await b.advance(5 * MIN);
  assert.equal((await b.send({ type: 'status' })).usage.totalMs, 0);
});

test('time while the computer slept is not counted', async () => {
  const { b } = await ready({ sites: [{ domain: 'youtube.com', limitMin: 60 }] });
  await b.openTab('https://www.youtube.com/');
  await b.advance(8 * 60 * MIN, { asleep: true });
  const ms = (await b.send({ type: 'status' })).usage.totalMs;
  assert.ok(ms <= 90 * 1000, `at most one gap credited, got ${ms}`);
});

test('unlocking: a valid code plus a choice lets the site back in; codes cannot be reused', async () => {
  const { b, secret } = await ready();
  const tab = await b.openTab('https://www.youtube.com/');
  await b.advance(3 * MIN);
  assert.ok(b.tab(tab.id).url.startsWith(BLOCK));

  assert.match((await b.send({ type: 'unlock', site: 'youtube.com', code: '123456', choice: '15m' })).error, /isn't right/);
  const code = await b.code(secret);
  assert.deepEqual(await b.send({ type: 'unlock', site: 'youtube.com', code, choice: '15m' }), { ok: true });
  assert.match((await b.send({ type: 'unlock', site: 'youtube.com', code, choice: 'day' })).error, /isn't right/, 'replay');

  // The block page sends you back; time then runs on the 15-minute bonus.
  b.tab(tab.id).url = 'https://www.youtube.com/';
  await b.event('updated', tab.id, { url: 'https://www.youtube.com/', status: 'loading' });
  await b.advance(10 * MIN);
  assert.equal(b.tab(tab.id).url, 'https://www.youtube.com/');
  await b.advance(6 * MIN);
  assert.ok(b.tab(tab.id).url.startsWith(BLOCK), 'blocked again once the 15 minutes are used');
});

test('"rest of the day" lasts until midnight, then limits apply again', async () => {
  const { b, secret } = await ready();
  const tab = await b.openTab('https://www.youtube.com/');
  await b.advance(3 * MIN);
  await b.send({ type: 'unlock', site: 'youtube.com', code: await b.code(secret), choice: 'day' });
  b.tab(tab.id).url = 'https://www.youtube.com/';
  await b.event('updated', tab.id, { url: 'https://www.youtube.com/', status: 'loading' });
  await b.advance(3 * 60 * MIN);
  assert.equal(b.tab(tab.id).url, 'https://www.youtube.com/');
  // Next day: fresh usage, limit applies again.
  await b.advance(new Date(2026, 10, 19, 0, 5).getTime() - b.now);
  const s = await b.send({ type: 'status' });
  assert.equal(s.usage.day, '2026-11-19');
  assert.equal(s.usage.unlimited['youtube.com'], undefined);
  await b.advance(3 * MIN);
  assert.ok(b.tab(tab.id).url.startsWith(BLOCK));
});

test('the daily total cap blocks every tracked site', async () => {
  const { b } = await ready({ sites: [{ domain: 'youtube.com', limitMin: 60 }, { domain: 'instagram.com', limitMin: 60 }], overallCapMin: 3 });
  await b.openTab('https://www.youtube.com/');
  await b.advance(2 * MIN);
  const ig = await b.openTab('https://www.instagram.com/');
  await b.advance(1.5 * MIN);
  const url = new URL(b.tab(ig.id).url);
  assert.equal(url.href.split('?')[0], BLOCK);
  const yt = await b.openTab('https://www.youtube.com/');
  assert.ok(b.tab(yt.id).url.startsWith(BLOCK));
});

test('loosening settings needs a code; tightening does not', async () => {
  const { b, secret } = await ready({ sites: [{ domain: 'youtube.com', limitMin: 30 }], overallCapMin: 60 });
  assert.deepEqual(await b.send({ type: 'saveConfig', config: { sites: [{ domain: 'youtube.com', limitMin: 20 }], overallCapMin: 45 } }), { ok: true });
  const raise = { sites: [{ domain: 'youtube.com', limitMin: 90 }], overallCapMin: 45 };
  const need = await b.send({ type: 'saveConfig', config: raise });
  assert.deepEqual(need.needCode, ['raising youtube.com from 20 to 90 min']);
  assert.equal((await b.send({ type: 'status' })).config.sites[0].limitMin, 20, 'not saved');
  const bad = await b.send({ type: 'saveConfig', config: raise, code: '111111' });
  assert.match(bad.error, /isn't right/);
  assert.deepEqual(await b.send({ type: 'saveConfig', config: raise, code: await b.code(secret) }), { ok: true });
  assert.equal((await b.send({ type: 'status' })).config.sites[0].limitMin, 90);
  // Pausing is loosening too.
  assert.deepEqual((await b.send({ type: 'saveConfig', config: { ...raise, paused: true } })).needCode, ['pausing Time Guard']);
});

test('five wrong codes lock code entry for two minutes', async () => {
  const { b, secret } = await ready();
  for (let i = 0; i < 4; i++) await b.send({ type: 'unlock', site: 'youtube.com', code: '000000', choice: '15m' });
  assert.match((await b.send({ type: 'unlock', site: 'youtube.com', code: '000000', choice: '15m' })).error, /Locked for 2 minutes/);
  assert.match((await b.send({ type: 'unlock', site: 'youtube.com', code: await b.code(secret), choice: '15m' })).error, /Try again in/);
  await b.advance(2 * MIN + 1000);
  assert.deepEqual(await b.send({ type: 'unlock', site: 'youtube.com', code: await b.code(secret), choice: '15m' }), { ok: true });
});

test('a blocked Incognito tab is closed and the block page opens in a normal window, without the address', async () => {
  const { b } = await ready();
  b.state.windows.push({ id: 2, focused: true, incognito: true, type: 'normal' });
  b.state.windows[0].focused = false;
  const tab = await b.openTab('https://www.youtube.com/watch?v=secret', { windowId: 2 });
  await b.advance(3 * MIN);
  assert.ok(b.state.removed.includes(tab.id));
  const opened = b.state.created.find((t) => t.url.startsWith(BLOCK));
  assert.equal(opened.windowId, 1);
  assert.equal(new URL(opened.url).searchParams.get('from'), null);
});

test('replacing the authenticator needs a code from the current one', async () => {
  const { b, secret } = await ready();
  assert.match((await b.send({ type: 'setupBegin', code: '000000' })).error, /isn't right/);
  const begin = await b.send({ type: 'setupBegin', code: await b.code(secret) });
  assert.notEqual(begin.secret, secret);
  await b.advance(30 * 1000);
  assert.deepEqual(await b.send({ type: 'setupConfirm', code: await b.code(begin.secret) }), { ok: true });
  await b.advance(30 * 1000);
  // The old phone entry no longer works.
  assert.match((await b.send({ type: 'unlock', site: 'youtube.com', code: await b.code(secret), choice: '15m' })).error, /isn't right/);
});

test('messages from web pages are ignored', async () => {
  const { b } = await ready();
  const reply = await b.send({ type: 'unlock', site: 'youtube.com', code: '000000', choice: 'day' }, { id: 'other-extension', url: 'https://evil.example/' });
  assert.equal(reply, undefined);
});
