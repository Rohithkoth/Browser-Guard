// DOM tests: load the real content-script files into jsdom and check what the
// scanner does to YouTube- and Instagram-shaped markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const FILES = [
  'src/shared/normalize.js',
  'src/shared/rules.js',
  'src/shared/overlay.js',
  'src/shared/scanner.js',
  'src/platforms/youtube.js',
  'src/platforms/instagram.js',
].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));

const NOW = Date.now();
const DOOMSDAY = { id: 'a', name: 'Avengers: Doomsday', keywords: ['Avengers Doomsday', 'Doctor Doom'], enabled: true, expiresAt: null };
const GTA = { id: 'b', name: 'GTA VI', keywords: ['GTA 6', 'GTA VI'], enabled: true, expiresAt: null };

// Changes are checked on the next animation frame (~16ms in jsdom).
const flush = () => new Promise((resolve) => setTimeout(resolve, 40));

function setup(body, platform = 'youtube') {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  for (const code of FILES) dom.window.eval(code);
  const w = dom.window;
  const SG = w.SpoilerGuard;
  const scanner = SG.createScanner(SG.platforms[platform], w.document);
  const apply = (rules) => scanner.setRules(SG.compileRules(rules, NOW));
  const $ = (sel) => w.document.querySelector(sel);
  const hostOf = (card) => [...card.children].find((c) => c.classList.contains('sg-overlay-host')) || null;
  return { w, SG, scanner, apply, $, hostOf };
}

const ytCard = (id, title) =>
  `<ytd-rich-item-renderer id="${id}"><a id="thumbnail" href="/watch?v=${id}"><img src="t.jpg"></a>` +
  `<yt-formatted-string id="video-title">${title}</yt-formatted-string></ytd-rich-item-renderer>`;

test('matching card is concealed, unrelated card is untouched', () => {
  const { apply, $, hostOf } = setup(ytCard('spoiler', 'Avengers: Doomsday ENDING explained') + ytCard('safe', 'Cooking pasta'));
  apply([DOOMSDAY]);
  assert.ok($('#spoiler').classList.contains('sg-concealed'));
  assert.ok(hostOf($('#spoiler')));
  assert.ok(!$('#safe').classList.contains('sg-concealed'));
  assert.equal(hostOf($('#safe')), null);
  assert.ok($('#spoiler').hasAttribute('data-sg-checked'));
  assert.ok($('#safe').hasAttribute('data-sg-checked'));
});

test('overlay names the rule but never the keyword that matched', () => {
  const { apply, $, hostOf } = setup(ytCard('spoiler', 'Doctor Doom reveal'));
  apply([DOOMSDAY]);
  const label = hostOf($('#spoiler')).getAttribute('aria-label');
  assert.equal(label, 'Blocked by Spoiler Guard: Avengers: Doomsday');
  assert.doesNotMatch(label.toLowerCase(), /doctor doom/);
});

test('item matching several rules lists each rule once', () => {
  const { apply, $, hostOf } = setup(ytCard('both', 'Doctor Doom in GTA 6'));
  apply([DOOMSDAY, GTA]);
  assert.equal(hostOf($('#both')).getAttribute('aria-label'), 'Blocked by Spoiler Guard: Avengers: Doomsday, GTA VI');
  apply([DOOMSDAY, GTA]);
  assert.equal($('#both').querySelectorAll('.sg-overlay-host').length, 1);
});

test('cards added after load are concealed (infinite scroll)', async () => {
  const { w, apply, $ } = setup('<div id="feed"></div>');
  apply([DOOMSDAY]);
  const wrapper = w.document.createElement('div');
  wrapper.innerHTML = ytCard('late', 'Avengers Doomsday leaked set photos') + ytCard('late-safe', 'Lo-fi beats');
  $('#feed').append(wrapper);
  await flush();
  assert.ok($('#late').classList.contains('sg-concealed'));
  assert.ok(!$('#late-safe').classList.contains('sg-concealed'));
  assert.ok($('#late-safe').hasAttribute('data-sg-checked'));
});

test('a reused card is re-checked when its title changes', async () => {
  const { apply, $ } = setup(ytCard('reused', 'Cooking pasta'));
  apply([DOOMSDAY]);
  assert.ok(!$('#reused').classList.contains('sg-concealed'));

  $('#video-title').textContent = 'Avengers Doomsday post-credits scene';
  await flush();
  assert.ok($('#reused').classList.contains('sg-concealed'));

  $('#video-title').firstChild.data = 'Gardening tips';
  await flush();
  assert.ok(!$('#reused').classList.contains('sg-concealed'));
});

test('titles stored only in attributes are matched', () => {
  const { apply, $ } = setup(
    '<yt-lockup-view-model id="attr"><a href="/watch?v=1" aria-label="Avengers Doomsday trailer reaction"><img src="x.jpg"></a></yt-lockup-view-model>',
  );
  apply([DOOMSDAY]);
  assert.ok($('#attr').classList.contains('sg-concealed'));
});

test('turning a rule off restores the content; removing all rules stops observing', async () => {
  const { w, apply, $, hostOf } = setup(ytCard('spoiler', 'Avengers Doomsday') + ytCard('gta', 'GTA 6 map leak'));
  apply([DOOMSDAY, GTA]);
  apply([{ ...DOOMSDAY, enabled: false }, GTA]);
  assert.ok(!$('#spoiler').classList.contains('sg-concealed'));
  assert.equal(hostOf($('#spoiler')), null);
  assert.ok($('#gta').classList.contains('sg-concealed'));

  apply([]);
  assert.equal(w.document.querySelectorAll('.sg-concealed, .sg-overlay-host').length, 0);

  // With nothing active, new cards are left alone.
  w.document.body.insertAdjacentHTML('beforeend', ytCard('after', 'Avengers Doomsday'));
  await flush();
  assert.ok(!$('#after').classList.contains('sg-concealed'));
});

test('an expired rule unblocks content the same way as turning it off', () => {
  const { SG, scanner, $ } = setup(ytCard('spoiler', 'Avengers Doomsday'));
  const expiring = { ...DOOMSDAY, expiresAt: NOW + 1000 };
  scanner.setRules(SG.compileRules([expiring], NOW));
  assert.ok($('#spoiler').classList.contains('sg-concealed'));
  scanner.setRules(SG.compileRules([expiring], NOW + 1000));
  assert.ok(!$('#spoiler').classList.contains('sg-concealed'));
});

test('nested cards get a single overlay on the outer card', () => {
  const { apply, $ } = setup(
    '<ytd-rich-item-renderer id="outer"><yt-lockup-view-model id="inner"><h3>Avengers Doomsday</h3></yt-lockup-view-model></ytd-rich-item-renderer>',
  );
  apply([DOOMSDAY]);
  assert.ok($('#outer').classList.contains('sg-concealed'));
  assert.ok(!$('#inner').classList.contains('sg-concealed'));
  assert.equal($('#outer').querySelectorAll('.sg-overlay-host').length, 1);
});

test('clicks and hovers on the overlay never reach the hidden item', () => {
  const { w, apply, $, hostOf } = setup(ytCard('spoiler', 'Avengers Doomsday'));
  apply([DOOMSDAY]);
  let reached = 0;
  $('#spoiler').addEventListener('click', () => reached++);
  $('#spoiler').addEventListener('mouseover', () => reached++);
  const host = hostOf($('#spoiler'));
  const click = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  host.dispatchEvent(click);
  host.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
  assert.equal(reached, 0);
  assert.ok(click.defaultPrevented);
});

test('Instagram: feed post caption and hashtags, grid tile alt text', () => {
  const { apply, $ } = setup(
    '<article id="post"><img alt="Photo by someone"><span>can not believe that ending #AvengersDoomsday</span></article>' +
    '<article id="post-safe"><img alt="Photo of a sunset"><span>beach day</span></article>' +
    '<a id="tile" href="/p/ABC123/"><img alt="May be an image of Doctor Doom and text"></a>' +
    '<a id="tile-safe" href="/p/XYZ789/"><img alt="May be an image of a dog"></a>',
    'instagram',
  );
  apply([DOOMSDAY]);
  assert.ok($('#post').classList.contains('sg-concealed'));
  assert.ok(!$('#post-safe').classList.contains('sg-concealed'));
  assert.ok($('#tile').classList.contains('sg-concealed'));
  assert.ok(!$('#tile-safe').classList.contains('sg-concealed'));
});

test('Instagram: a post link inside a feed article is covered by the article only', () => {
  const { apply, $ } = setup(
    '<article id="post"><a id="inner-link" href="/p/ABC/"><img alt="x"></a><span>Doctor Doom!!</span></article>',
    'instagram',
  );
  apply([DOOMSDAY]);
  assert.ok($('#post').classList.contains('sg-concealed'));
  assert.ok(!$('#inner-link').classList.contains('sg-concealed'));
});

test('rule names are inserted as text, never as HTML', () => {
  const { apply, $, hostOf } = setup(ytCard('spoiler', 'Avengers Doomsday'));
  const evil = { ...DOOMSDAY, name: '<img src=x onerror=alert(1)>' };
  apply([evil]);
  assert.equal($('#spoiler').querySelectorAll('img[onerror]').length, 0);
  assert.match(hostOf($('#spoiler')).getAttribute('aria-label'), /<img src=x/);
});

// Regression: inner cards were never marked checked, so the pre-hide CSS kept
// every nested card (YouTube home/channel grids, Instagram feed images) invisible.
test('nested cards are marked checked, so pre-hide never keeps them hidden', async () => {
  const nested = (id, title) =>
    `<ytd-rich-item-renderer id="${id}"><yt-lockup-view-model id="${id}-inner"><h3>${title}</h3></yt-lockup-view-model></ytd-rich-item-renderer>`;
  const { w, apply, $ } = setup('<div id="grid">' + nested('safe', 'Cooking pasta') + nested('spoiler', 'Avengers Doomsday') + '</div>');
  apply([DOOMSDAY]);
  for (const id of ['safe', 'safe-inner', 'spoiler', 'spoiler-inner']) {
    assert.ok($('#' + id).hasAttribute('data-sg-checked'), `${id} should be checked`);
  }

  $('#grid').insertAdjacentHTML('beforeend', nested('late', 'Lo-fi beats'));
  await flush();
  assert.ok($('#late').hasAttribute('data-sg-checked'));
  assert.ok($('#late-inner').hasAttribute('data-sg-checked'));
  assert.equal(w.document.querySelectorAll('.sg-concealed').length, 1);
});

test('Instagram: the post link inside a feed article is marked checked', () => {
  const { apply, $ } = setup(
    '<article id="post"><a id="inner-link" href="/p/ABC/"><img alt="a dog"></a><span>beach day</span></article>',
    'instagram',
  );
  apply([DOOMSDAY]);
  assert.ok($('#post').hasAttribute('data-sg-checked'));
  assert.ok($('#inner-link').hasAttribute('data-sg-checked'));
});

test('"Show anyway" needs two clicks, then keeps that item visible', async () => {
  const { apply, $, hostOf } = setup(ytCard('spoiler', 'Avengers Doomsday') + ytCard('other', 'Doctor Doom'));
  apply([DOOMSDAY]);
  const button = hostOf($('#spoiler'))._sgButton;
  assert.ok(button, 'overlay has a Show anyway button');

  button.click();
  assert.ok($('#spoiler').classList.contains('sg-concealed'), 'first click only arms it');
  button.click();
  assert.ok(!$('#spoiler').classList.contains('sg-concealed'), 'second click reveals');
  assert.equal(hostOf($('#spoiler')), null);
  assert.ok($('#other').classList.contains('sg-concealed'), 'other items stay covered');

  // Stays revealed when the card's text changes in place (e.g. a view count
  // updating) or rules are re-applied.
  $('#spoiler').append(' 1.3M views');
  await flush();
  apply([DOOMSDAY]);
  assert.ok(!$('#spoiler').classList.contains('sg-concealed'));
});

test('"Show anyway" is forgotten when the card is reused for different content', async () => {
  const { apply, $, hostOf } = setup(ytCard('reused', 'Avengers Doomsday trailer'));
  apply([DOOMSDAY]);
  const button = hostOf($('#reused'))._sgButton;
  button.click();
  button.click();
  assert.ok(!$('#reused').classList.contains('sg-concealed'));

  // YouTube swaps in a different video: new link and new title.
  $('#thumbnail').setAttribute('href', '/watch?v=different');
  $('#video-title').textContent = 'Avengers Doomsday ending explained';
  await flush();
  assert.ok($('#reused').classList.contains('sg-concealed'));
});

test('"Show anyway" clicks never reach the hidden item', () => {
  const { apply, $, hostOf } = setup(ytCard('spoiler', 'Avengers Doomsday'));
  apply([DOOMSDAY]);
  let reached = 0;
  $('#spoiler').addEventListener('click', () => reached++);
  hostOf($('#spoiler'))._sgButton.click();
  assert.equal(reached, 0);
});

test('scheduled rule leaves trailers visible, then covers them once it starts', () => {
  const { SG, scanner, $ } = setup(ytCard('trailer', 'Avengers Doomsday official trailer'));
  const release = NOW + 60 * 60 * 1000;
  const scheduled = { ...DOOMSDAY, startsAt: release };
  scanner.setRules(SG.compileRules([scheduled], NOW));
  assert.ok(!$('#trailer').classList.contains('sg-concealed'));
  scanner.setRules(SG.compileRules([scheduled], release));
  assert.ok($('#trailer').classList.contains('sg-concealed'));
});
