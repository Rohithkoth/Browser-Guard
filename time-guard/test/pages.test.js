// Loads the real settings page and block page in jsdom, talking to the real
// service worker running on the fake Chrome, and clicks through the flows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createBrowser } = require('./fake-chrome.js');

const MIN = 60 * 1000;
const START = new Date(2026, 10, 18, 15, 0, 5).getTime();
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const opened = [];
test.after(() => opened.forEach((w) => w.close()));

function openPage(b, page, query = '') {
  const html = read(`src/${page}/${page}.html`).replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: `chrome-extension://timeguard/src/${page}/${page}.html${query}` });
  const w = dom.window;
  opened.push(w);
  const replaced = [];
  w.chrome = {
    runtime: {
      sendMessage: (msg) => b.send(msg, { id: 'timeguard', url: w.location.href }),
      openOptionsPage: () => {},
    },
    storage: { onChanged: { addListener: () => {} } },
  };
  w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, clearRect() {}, set fillStyle(v) {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const scripts = [...read(`src/${page}/${page}.html`).matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) w.eval(read(path.join('src', page, src)));
  return { w, $: (id) => w.document.getElementById(id), replaced };
}

const settle = () => new Promise((r) => setTimeout(r, 40));
const submit = async (w, form, submitter) => {
  const e = new w.Event('submit', { cancelable: true, bubbles: true });
  if (submitter) Object.defineProperty(e, 'submitter', { value: submitter });
  form.dispatchEvent(e);
  await settle();
};

test('settings page: first-run setup shows a key, and only a matching code finishes it', async () => {
  const b = createBrowser(START);
  await b.install();
  const page = openPage(b, 'options');
  await settle();
  assert.equal(page.$('setup').hidden, false);
  assert.equal(page.$('limits').hidden, true, 'limits are locked until setup');
  const key = page.$('setup-key').textContent.replace(/\s/g, '');
  assert.match(key, /^[A-Z2-7]{32}$/);

  page.$('confirm-code').value = '000000';
  await submit(page.w, page.$('confirm-form'));
  assert.match(page.$('setup-messages').textContent, /doesn't match/);

  // Reopening the page before finishing keeps the same key.
  const again = openPage(b, 'options');
  await settle();
  assert.equal(again.$('setup-key').textContent.replace(/\s/g, ''), key);

  page.$('confirm-code').value = await b.code(key);
  await submit(page.w, page.$('confirm-form'));
  assert.equal(page.$('setup').hidden, true);
  assert.equal(page.$('limits').hidden, false);
  assert.equal(page.$('setup-key').textContent, '', 'key removed from the page');
});

async function setUpWith(sites) {
  const b = createBrowser(START);
  await b.install();
  const begin = await b.send({ type: 'setupBegin' });
  await b.send({ type: 'setupConfirm', code: await b.code(begin.secret) });
  await b.advance(30 * 1000);
  const page = openPage(b, 'options');
  await settle();
  for (const [domain, minutes] of sites) {
    page.$('add-domain').value = domain;
    page.$('add-minutes').value = String(minutes);
    await submit(page.w, page.$('add-form'));
  }
  page.$('save').click();
  await settle();
  return { b, page, secret: begin.secret };
}

test('settings page: adding sites is free; raising a limit asks for a code', async () => {
  const { b, page, secret } = await setUpWith([['https://www.youtube.com/', 30], ['instagram.com', 10]]);
  assert.match(page.$('limit-messages').textContent, /Saved/);
  let s = await b.send({ type: 'status' });
  assert.deepEqual(s.config.sites, [{ domain: 'youtube.com', limitMin: 30 }, { domain: 'instagram.com', limitMin: 10 }]);

  const input = page.$('site-list').querySelector('input');
  input.value = '90';
  input.dispatchEvent(new page.w.Event('input'));
  page.$('save').click();
  await settle();
  assert.equal(page.$('gate').hidden, false);
  assert.match(page.$('gate-reasons').textContent, /raising youtube.com from 30 to 90 min/);
  s = await b.send({ type: 'status' });
  assert.equal(s.config.sites[0].limitMin, 30, 'not saved yet');

  page.$('gate-code').value = await b.code(secret);
  page.$('save').click();
  await settle();
  assert.match(page.$('limit-messages').textContent, /Saved/);
  assert.equal(page.$('gate').hidden, true);
  s = await b.send({ type: 'status' });
  assert.equal(s.config.sites[0].limitMin, 90);
});

test('settings page: removing a site needs a code too', async () => {
  const { b, page } = await setUpWith([['youtube.com', 30]]);
  page.$('site-list').querySelector('button').click();
  await settle();
  page.$('save').click();
  await settle();
  assert.match(page.$('gate-reasons').textContent, /removing youtube.com/);
  assert.equal((await b.send({ type: 'status' })).config.sites.length, 1);
});

test('block page: shows the limit, and a code plus a choice unlocks and sends you back', async () => {
  const { b, secret } = await setUpWith([['youtube.com', 2]]);
  const tab = await b.openTab('https://www.youtube.com/watch?v=abc');
  await b.advance(3 * MIN);
  const blockUrl = b.tab(tab.id).url;
  const query = blockUrl.slice(blockUrl.indexOf('?'));
  const page = openPage(b, 'blocked', query);
  await settle();
  assert.match(page.$('headline').textContent, /Time's up on youtube.com/);
  assert.match(page.$('usage').textContent, /of your 2 min today/);
  assert.match(page.$('reset').textContent, /midnight, in 8 h/);

  page.$('code').value = '123456';
  const buttons = page.w.document.querySelectorAll('.choices button');
  await submit(page.w, page.$('unlock-form'), buttons[1]);
  assert.match(page.$('messages').textContent, /isn't right/);

  page.$('code').value = await b.code(secret);
  await submit(page.w, page.$('unlock-form'), buttons[1]); // "1 more hour"
  assert.equal(page.$('done').hidden, false);
  assert.match(page.$('done-text').textContent, /1 more hour on youtube.com/);
  assert.equal(page.$('continue').href, 'https://www.youtube.com/watch?v=abc');
  const s = await b.send({ type: 'status' });
  assert.equal(s.usage.bonusMs['youtube.com'], 60 * MIN);
});

test('block page: never sends you anywhere but the limited site', async () => {
  const { b, secret } = await setUpWith([['youtube.com', 2]]);
  await b.openTab('https://www.youtube.com/');
  await b.advance(3 * MIN);
  const page = openPage(b, 'blocked', '?site=youtube.com&from=' + encodeURIComponent('https://evil.example/'));
  await settle();
  page.$('code').value = await b.code(secret);
  await submit(page.w, page.$('unlock-form'), page.w.document.querySelector('.choices button'));
  assert.equal(page.$('continue').href, 'https://youtube.com/');
});
