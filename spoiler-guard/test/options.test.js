// Loads the real settings page with an in-memory chrome.storage and runs an
// import and an export end to end.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// The settings page re-renders once a minute; close every page after the
// tests so that timer doesn't keep the test run alive.
const opened = [];
test.after(() => opened.forEach((w) => w.close()));

function openSettings(initialRules = []) {
  const html = read('src/options/options.html').replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const w = dom.window;
  opened.push(w);
  const store = { enabled: true, rules: initialRules };
  const listeners = [];
  w.chrome = {
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...structuredClone(store) }),
        set: async (values) => {
          Object.assign(store, structuredClone(values));
          const changes = Object.fromEntries(Object.keys(values).map((k) => [k, { newValue: values[k] }]));
          listeners.forEach((fn) => fn(changes, 'local'));
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
  };
  w.confirm = () => true;
  // jsdom's Blob/File lack .text(), which Chrome has; fill it in for the test.
  w.Blob.prototype.text = function () {
    return new Promise((resolve) => {
      const reader = new w.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(this);
    });
  };
  let exported = null;
  w.URL.createObjectURL = (blob) => { exported = blob; return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  for (const f of ['normalize', 'rules', 'storage', 'rulefile']) w.eval(read(`src/shared/${f}.js`));
  w.eval(read('src/options/options.js'));
  return { w, store, $: (id) => w.document.getElementById(id), exported: () => exported };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

async function importText(ctx, text) {
  const input = ctx.$('import-file');
  const file = new ctx.w.File([text], 'rules.txt', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new ctx.w.Event('change'));
  await settle();
}

test('importing a rule file adds rules and shows them in the list', async () => {
  const ctx = openSettings();
  await settle();
  await importText(ctx, '[Avengers: Doomsday]\nstart: 2026-12-18 19:00\nAvengers Doomsday\nDoctor Doom\n\n[GTA VI]\nGTA 6\n');
  assert.equal(ctx.store.rules.length, 2);
  assert.deepEqual(ctx.store.rules[0].keywords, ['Avengers Doomsday', 'Doctor Doom']);
  assert.equal(ctx.store.rules[0].enabled, true);
  assert.ok(ctx.store.rules[0].id);
  assert.match(ctx.$('share-messages').textContent, /2 added, 0 updated/);
  const listed = [...ctx.w.document.querySelectorAll('.rule strong')].map((n) => n.textContent);
  assert.deepEqual(listed, ['Avengers: Doomsday', 'GTA VI']);
  // Keywords stay out of the list.
  assert.doesNotMatch(ctx.$('rule-list').textContent, /Doctor Doom/);
});

test('a file with mistakes imports nothing and explains why', async () => {
  const ctx = openSettings();
  await settle();
  await importText(ctx, 'oops\n[Fine]\nkeyword here');
  assert.equal(ctx.store.rules.length, 0);
  assert.match(ctx.$('share-messages').textContent, /Nothing was imported/);
  assert.match(ctx.$('share-messages').textContent, /Line 1/);
});

test('export produces a file that imports back to the same rules', async () => {
  const start = new Date(2026, 11, 18, 19, 0).getTime();
  const ctx = openSettings([
    { id: 'a', name: 'Avengers: Doomsday', keywords: ['Avengers Doomsday', 'Doctor Doom'], enabled: true, startsAt: start, expiresAt: null, createdAt: 1 },
  ]);
  await settle();
  ctx.$('export-button').click();
  const text = await ctx.exported().text();
  assert.match(text, /\[Avengers: Doomsday\]\nstart: 2026-12-18 19:00\nAvengers Doomsday\nDoctor Doom/);

  const other = openSettings();
  await settle();
  await importText(other, text);
  assert.equal(other.store.rules.length, 1);
  assert.equal(other.store.rules[0].startsAt, start);
});
