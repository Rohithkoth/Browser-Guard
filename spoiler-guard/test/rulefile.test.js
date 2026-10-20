const test = require('node:test');
const assert = require('node:assert/strict');
const SG = require('../src/shared/normalize.js');
require('../src/shared/rules.js');
require('../src/shared/rulefile.js');

const NOW = new Date(2026, 9, 20, 12, 0).getTime();

const SAMPLE = `# Shared by a friend
[Avengers: Doomsday]
start: 2026-12-18 19:00
end: 2027-03-01
Avengers Doomsday
Doctor Doom

[GTA VI]
GTA 6
GTA VI
`;

test('parses names, keywords, comments and local-time dates', () => {
  const { rules, errors } = SG.parseRuleFile(SAMPLE, NOW);
  assert.deepEqual(errors, []);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], {
    name: 'Avengers: Doomsday',
    keywords: ['Avengers Doomsday', 'Doctor Doom'],
    startsAt: new Date(2026, 11, 18, 19, 0).getTime(),
    expiresAt: new Date(2027, 2, 1).getTime(),
    enabled: true,
  });
  assert.deepEqual(rules[1].keywords, ['GTA 6', 'GTA VI']);
  assert.equal(rules[1].startsAt, null);
});

test('handles Windows line endings, a byte-order mark and stray whitespace', () => {
  const windows = '﻿' + SAMPLE.replace(/\n/g, '\r\n').replace('Doctor Doom', '   Doctor Doom   ');
  const { rules, errors } = SG.parseRuleFile(windows, NOW);
  assert.deepEqual(errors, []);
  assert.deepEqual(rules[0].keywords, ['Avengers Doomsday', 'Doctor Doom']);
});

test('reports mistakes with line numbers and imports nothing', () => {
  const bad = `Stray keyword
[No keywords here]
[Bad date]
start: next friday
something
[Backwards]
start: 2026-12-01
end: 2026-11-01
x-wing
[Feb 30]
end: 2027-02-30
keyword`;
  const { rules, errors } = SG.parseRuleFile(bad, NOW);
  assert.equal(rules.length, 0);
  const all = errors.join('\n');
  assert.match(all, /Line 1: "Stray keyword" comes before any \[Rule name\]/);
  assert.match(all, /\[No keywords here\] \(line 2\): Add at least one keyword/);
  assert.match(all, /Line 4: "next friday" isn't a date/);
  assert.match(all, /\[Backwards\].*after the start date/);
  assert.match(all, /Line 11: "2027-02-30" isn't a date/);
});

test('an empty file or one with only comments is an error', () => {
  assert.match(SG.parseRuleFile('', NOW).errors[0], /No rules found/);
  assert.match(SG.parseRuleFile('# just a comment\n\n', NOW).errors[0], /No rules found/);
});

test('enabled: no imports the rule turned off', () => {
  const { rules } = SG.parseRuleFile('[Paused]\nenabled: no\nsomething long', NOW);
  assert.equal(rules[0].enabled, false);
});

test('export and re-import gives back the same rules', () => {
  const original = [
    { id: 'a', name: 'Avengers: Doomsday', keywords: ['Avengers Doomsday', 'Doctor Doom'], enabled: true,
      startsAt: new Date(2026, 11, 18, 19, 30).getTime(), expiresAt: new Date(2027, 2, 1).getTime() },
    { id: 'b', name: 'Paused one', keywords: ['severance'], enabled: false, startsAt: null, expiresAt: null },
  ];
  const text = SG.formatRuleFile(original);
  assert.match(text, /start: 2026-12-18 19:30/);
  assert.match(text, /end: 2027-03-01\n/);
  const { rules, errors } = SG.parseRuleFile(text, NOW);
  assert.deepEqual(errors, []);
  assert.deepEqual(rules, original.map(({ id, ...rest }) => ({ ...rest, startsAt: rest.startsAt, expiresAt: rest.expiresAt })));
});

test('merging replaces same-named rules and adds new ones', () => {
  const existing = [
    { id: 'keep-id', name: 'avengers doomsday', keywords: ['old'], enabled: false, startsAt: null, expiresAt: null, createdAt: 1 },
    { id: 'other', name: 'Unrelated', keywords: ['x-files'], enabled: true, startsAt: null, expiresAt: null, createdAt: 2 },
  ];
  const { rules: imported } = SG.parseRuleFile(SAMPLE, NOW);
  const { rules, added, updated } = SG.mergeImported(existing, imported, NOW);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.equal(rules.length, 3);
  const replaced = rules.find((r) => r.id === 'keep-id');
  assert.equal(replaced.name, 'Avengers: Doomsday');
  assert.deepEqual(replaced.keywords, ['Avengers Doomsday', 'Doctor Doom']);
  assert.equal(replaced.createdAt, 1);
  assert.equal(replaced.enabled, true);
  assert.ok(rules.find((r) => r.name === 'GTA VI').id);
  assert.deepEqual(rules[1], existing[1]);
});

test('a file listing the same rule twice adds it once', () => {
  const { rules: imported } = SG.parseRuleFile('[Dup]\nkeyword one\n[dup]\nkeyword two', NOW);
  const { rules, added, updated } = SG.mergeImported([], imported, NOW);
  assert.equal(rules.length, 1);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.deepEqual(rules[0].keywords, ['keyword two']);
});
