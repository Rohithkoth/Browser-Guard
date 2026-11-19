const test = require('node:test');
const assert = require('node:assert/strict');
const TG = require('../src/shared/limits.js');

const MIN = 60 * 1000;
const NOW = new Date(2026, 10, 18, 15, 0).getTime();
const config = (over = {}) => ({
  sites: [{ domain: 'youtube.com', limitMin: 60 }, { domain: 'instagram.com', limitMin: 20 }],
  overallCapMin: null,
  paused: false,
  ...over,
});
const usage = (over = {}) => ({ ...TG.freshUsage(NOW), ...over });

test('normalizeDomain cleans up pasted addresses', () => {
  assert.equal(TG.normalizeDomain('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(TG.normalizeDomain('m.youtube.com'), 'm.youtube.com');
  assert.equal(TG.normalizeDomain('reddit.com/r/all'), 'reddit.com');
  assert.equal(TG.normalizeDomain('localhost'), '');
  assert.equal(TG.normalizeDomain('not a site'), '');
  assert.equal(TG.normalizeDomain(''), '');
});

test('subdomains count toward their site; lookalikes do not', () => {
  const sites = config().sites;
  assert.equal(TG.siteForUrl('https://www.youtube.com/watch?v=1', sites), 'youtube.com');
  assert.equal(TG.siteForUrl('https://m.youtube.com/', sites), 'youtube.com');
  assert.equal(TG.siteForUrl('https://notyoutube.com/', sites), null);
  assert.equal(TG.siteForUrl('https://youtube.com.evil.example/', sites), null);
  assert.equal(TG.siteForUrl('chrome-extension://abc/blocked.html', sites), null);
  assert.equal(TG.siteForUrl('not a url', sites), null);
  const nested = [{ domain: 'google.com', limitMin: 5 }, { domain: 'mail.google.com', limitMin: 50 }];
  assert.equal(TG.siteForHost('mail.google.com', nested), 'mail.google.com', 'most specific wins');
});

test('per-site limit blocks only that site', () => {
  const u = usage({ perSite: { 'youtube.com': 60 * MIN }, totalMs: 60 * MIN });
  assert.equal(TG.isBlocked('youtube.com', config(), u), true);
  assert.equal(TG.blockReason('youtube.com', config(), u), 'site');
  assert.equal(TG.isBlocked('instagram.com', config(), u), false);
});

test('the overall cap blocks every tracked site once reached', () => {
  const c = config({ overallCapMin: 70 });
  const u = usage({ perSite: { 'youtube.com': 55 * MIN, 'instagram.com': 15 * MIN }, totalMs: 70 * MIN });
  assert.equal(TG.isBlocked('youtube.com', c, u), true);
  assert.equal(TG.isBlocked('instagram.com', c, u), true);
  assert.equal(TG.blockReason('youtube.com', c, u), 'total');
  assert.equal(TG.remainingUnderLimits('youtube.com', c, usage({ perSite: { 'youtube.com': 10 * MIN }, totalMs: 65 * MIN })), 5 * MIN);
});

test('pausing lifts every limit', () => {
  const u = usage({ perSite: { 'youtube.com': 999 * MIN }, totalMs: 999 * MIN });
  assert.equal(TG.isBlocked('youtube.com', config({ paused: true }), u), false);
});

test('usage resets at local midnight', () => {
  const old = usage({ day: '2026-11-17', perSite: { 'youtube.com': 60 * MIN }, totalMs: 60 * MIN });
  assert.equal(TG.currentUsage(old, NOW).totalMs, 0);
  const today = usage({ totalMs: 5 });
  assert.equal(TG.currentUsage(today, NOW), today);
  assert.equal(TG.nextReset(NOW), new Date(2026, 10, 19).getTime());
});

test('elapsed time counts once toward the total even with two sites active', () => {
  const u = TG.applyElapsed(usage(), config(), ['youtube.com', 'instagram.com'], 5 * MIN);
  assert.equal(u.perSite['youtube.com'], 5 * MIN);
  assert.equal(u.perSite['instagram.com'], 5 * MIN);
  assert.equal(u.totalMs, 5 * MIN);
  assert.equal(TG.applyElapsed(usage(), config(), [], 5 * MIN).totalMs, 0);
});

test('grants: 1, 15 and 30 minutes add extra time that stacks', () => {
  const blocked = usage({ perSite: { 'youtube.com': 60 * MIN }, totalMs: 60 * MIN });
  let u = TG.applyGrant(blocked, 'youtube.com', '1m');
  assert.equal(TG.isBlocked('youtube.com', config(), u), false);
  assert.equal(TG.timeLeft('youtube.com', config(), u), 1 * MIN);
  u = TG.applyGrant(u, 'youtube.com', '15m');
  u = TG.applyGrant(u, 'youtube.com', '30m');
  assert.equal(TG.timeLeft('youtube.com', config(), u), 46 * MIN);
  assert.deepEqual(Object.keys(TG.GRANTS), ['1m', '15m', '30m']);
  for (const old of ['day', '1h']) assert.throws(() => TG.applyGrant(blocked, 'youtube.com', old));
});

test('bonus time is only spent once a site is past its limits, then it blocks again', () => {
  // 5 min under the limit, 15 min bonus: 10 min of use spends 5 min of bonus.
  let u = usage({ perSite: { 'youtube.com': 55 * MIN }, totalMs: 55 * MIN, bonusMs: { 'youtube.com': 15 * MIN } });
  u = TG.applyElapsed(u, config(), ['youtube.com'], 10 * MIN);
  assert.equal(u.bonusMs['youtube.com'], 10 * MIN);
  assert.equal(TG.isBlocked('youtube.com', config(), u), false);
  u = TG.applyElapsed(u, config(), ['youtube.com'], 10 * MIN);
  assert.equal(u.bonusMs['youtube.com'], 0);
  assert.equal(TG.isBlocked('youtube.com', config(), u), true);
});

test('unlimited sites never spend bonus and never block', () => {
  let u = usage({ perSite: { 'youtube.com': 60 * MIN }, totalMs: 60 * MIN, unlimited: { 'youtube.com': true }, bonusMs: { 'youtube.com': 5 * MIN } });
  u = TG.applyElapsed(u, config(), ['youtube.com'], 30 * MIN);
  assert.equal(u.bonusMs['youtube.com'], 5 * MIN);
  assert.equal(TG.isBlocked('youtube.com', config(), u), false);
});

test('msUntilNextBlock finds the first active site to run out', () => {
  const u = usage({ perSite: { 'youtube.com': 50 * MIN, 'instagram.com': 18 * MIN }, totalMs: 68 * MIN });
  assert.equal(TG.msUntilNextBlock(['youtube.com', 'instagram.com'], config(), u), 2 * MIN);
  assert.equal(TG.msUntilNextBlock(['youtube.com'], config({ overallCapMin: 70 }), u), 2 * MIN);
  assert.equal(TG.msUntilNextBlock([], config(), u), Infinity);
});

test('looseningChanges: tightening is free, loosening is listed', () => {
  const base = config({ overallCapMin: 90 });
  assert.deepEqual(TG.looseningChanges(base, base), []);
  assert.deepEqual(TG.looseningChanges(base, { ...base, sites: [...base.sites, { domain: 'reddit.com', limitMin: 10 }] }), [], 'adding a site');
  assert.deepEqual(TG.looseningChanges(base, { ...base, sites: [{ domain: 'youtube.com', limitMin: 30 }, base.sites[1]] }), [], 'lowering a limit');
  assert.deepEqual(TG.looseningChanges(base, { ...base, overallCapMin: 60 }), [], 'lowering the cap');
  assert.deepEqual(TG.looseningChanges(config(), base), [], 'adding a cap');
  assert.deepEqual(TG.looseningChanges({ ...base, paused: true }, base), [], 'resuming');

  assert.deepEqual(TG.looseningChanges(base, { ...base, paused: true }), ['pausing Time Guard']);
  assert.deepEqual(TG.looseningChanges(base, { ...base, sites: [base.sites[0]] }), ['removing instagram.com']);
  assert.deepEqual(TG.looseningChanges(base, { ...base, sites: [{ domain: 'youtube.com', limitMin: 90 }, base.sites[1]] }), ['raising youtube.com from 60 to 90 min']);
  assert.deepEqual(TG.looseningChanges(base, { ...base, overallCapMin: null }), ['removing the daily total cap']);
  assert.deepEqual(TG.looseningChanges(base, { ...base, overallCapMin: 120 }), ['raising the daily total from 90 to 120 min']);
});

test('validateConfig normalizes domains and rejects bad input', () => {
  const ok = TG.validateConfig({ sites: [{ domain: 'https://www.YouTube.com/', limitMin: '60' }], overallCapMin: '' });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.config, { sites: [{ domain: 'youtube.com', limitMin: 60 }], overallCapMin: null, paused: false });

  const bad = TG.validateConfig({
    sites: [{ domain: 'nope', limitMin: 10 }, { domain: 'x.com', limitMin: 0 }, { domain: 'x.com', limitMin: 5 }, { domain: 'y.com', limitMin: 2.5 }],
    overallCapMin: 2000,
  });
  const all = bad.errors.join('\n');
  assert.match(all, /"nope" isn't a website address/);
  assert.match(all, /limit for x.com must be a whole number/);
  assert.match(all, /x.com is listed twice/);
  assert.match(all, /limit for y.com/);
  assert.match(all, /daily total must be/);
});

test('formatMinutes', () => {
  assert.equal(TG.formatMinutes(5 * MIN + 59000), '5 min');
  assert.equal(TG.formatMinutes(125 * MIN), '2 h 05 min');
  assert.equal(TG.formatMinutes(Infinity), 'unlimited');
});

test('parseSiteList reads plain lists, full addresses, CSV and missing minutes', () => {
  const text = [
    '\uFEFFsite,minutes',
    'youtube.com 60',
    'https://www.reddit.com/r/all, 20',
    'tiktok.com',
    '  # a comment',
    '',
    'twitch.tv\t45',
    'netflix.com; 90',
    'x.com 15min   # trailing comment',
    'YouTube.com 45',
  ].join('\r\n');
  const { sites, errors, duplicates } = TG.parseSiteList(text, 30);
  assert.deepEqual(errors, []);
  assert.equal(duplicates, 1);
  assert.deepEqual(sites, [
    { domain: 'youtube.com', limitMin: 45 },
    { domain: 'reddit.com', limitMin: 20 },
    { domain: 'tiktok.com', limitMin: 30 },
    { domain: 'twitch.tv', limitMin: 45 },
    { domain: 'netflix.com', limitMin: 90 },
    { domain: 'x.com', limitMin: 15 },
  ]);
});

test('parseSiteList skips bad lines and says which', () => {
  const { sites, errors } = TG.parseSiteList('ok.com 5\nnot a site\nzero.com 0\nhuge.com 5000\nhalf.com 2.5\nlocalhost 10', 30);
  assert.deepEqual(sites, [{ domain: 'ok.com', limitMin: 5 }]);
  const all = errors.join('\n');
  assert.match(all, /Line 2: "not" isn't a website address/);
  assert.match(all, /Line 3: "0" isn't a valid number of minutes for zero.com/);
  assert.match(all, /Line 4: "5000"/);
  assert.match(all, /Line 5: "2.5"/);
  assert.match(all, /Line 6: "localhost"/);
  assert.match(TG.parseSiteList('a.com', NaN).errors[0], /no minutes given for a.com/);
});

test('parseSiteList handles a large list quickly', () => {
  const text = Array.from({ length: 5000 }, (_, i) => `site${i}.example.com ${(i % 120) + 1}`).join('\n');
  const t0 = Date.now();
  const { sites, errors } = TG.parseSiteList(text, 30);
  assert.equal(sites.length, 5000);
  assert.deepEqual(errors, []);
  assert.ok(Date.now() - t0 < 500);
});

test('mergeSites adds new sites, updates changed ones, counts the rest', () => {
  const existing = [{ domain: 'youtube.com', limitMin: 60 }, { domain: 'reddit.com', limitMin: 20 }];
  const r = TG.mergeSites(existing, [
    { domain: 'youtube.com', limitMin: 30 },
    { domain: 'reddit.com', limitMin: 20 },
    { domain: 'tiktok.com', limitMin: 10 },
  ]);
  assert.deepEqual(r.sites, [{ domain: 'youtube.com', limitMin: 30 }, { domain: 'reddit.com', limitMin: 20 }, { domain: 'tiktok.com', limitMin: 10 }]);
  assert.deepEqual([r.added, r.updated, r.unchanged], [1, 1, 1]);
  assert.equal(existing[0].limitMin, 60, 'input not modified');
});
