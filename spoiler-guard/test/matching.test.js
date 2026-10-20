const test = require('node:test');
const assert = require('node:assert/strict');
const SG = require('../src/shared/normalize.js');
require('../src/shared/rules.js');

const NOW = Date.UTC(2026, 9, 19, 12, 0);
const HOUR = 60 * 60 * 1000;

function rule(overrides) {
  return { id: 'r1', name: 'Avengers: Doomsday', keywords: ['Avengers: Doomsday'], enabled: true, expiresAt: null, ...overrides };
}

function matches(text, rules, now = NOW) {
  return SG.matchText(text, SG.compileRules(rules, now));
}

test('normalize ignores case, punctuation, accents, full-width text and extra whitespace', () => {
  assert.equal(SG.normalize('  AVENGERS:   Doomsday!! '), 'avengers doomsday');
  assert.equal(SG.normalize('Avengers—Doomsday'), 'avengers doomsday');
  assert.equal(SG.normalize('Pokémon'), 'pokemon');
  assert.equal(SG.normalize('ＡＶＥＮＧＥＲＳ'), 'avengers');
  assert.equal(SG.normalize("Thor's hammer"), 'thor s hammer');
  assert.equal(SG.normalize(null), '');
});

test('phrase matches regardless of formatting', () => {
  const rules = [rule()];
  assert.equal(matches('AVENGERS DOOMSDAY Official Trailer', rules).length, 1);
  assert.equal(matches('avengers: doomsday — ending explained', rules).length, 1);
  assert.equal(matches('Avengers-Doomsday reaction', rules).length, 1);
});

test('multi-word keywords match hashtag forms', () => {
  const rules = [rule()];
  assert.equal(matches('so hyped #AvengersDoomsday', rules).length, 1);
  assert.equal(matches('#AvengersDoomsdaySpoilers inside', rules).length, 1);
});

test('keywords only match whole words', () => {
  const rules = [rule({ keywords: ['Thor'] })];
  assert.equal(matches('A thorough review of the GPU', rules).length, 0);
  assert.equal(matches('Thor finally returns', rules).length, 1);
  assert.equal(matches("Thor's new hammer", rules).length, 1);
  // Single words don't get the hashtag prefix rule, so #Thorough is safe.
  assert.equal(matches('#Thorough', rules).length, 0);
});

test('unrelated content does not match', () => {
  const rules = [rule({ keywords: ['Avengers: Doomsday', 'Doctor Doom'] })];
  assert.equal(matches('Best pasta recipes of 2026', rules).length, 0);
  assert.equal(matches('Avengers: Endgame rewatch', rules).length, 0);
  assert.equal(matches('Doomsday prepping basics', rules).length, 0);
  assert.equal(matches('', rules).length, 0);
});

test('multiple rules match independently and return names, not keywords', () => {
  const rules = [
    rule({ id: 'a', name: 'Avengers: Doomsday', keywords: ['Doctor Doom'] }),
    rule({ id: 'b', name: 'GTA VI', keywords: ['GTA 6', 'GTA VI'] }),
    rule({ id: 'c', name: 'Unrelated', keywords: ['Severance'] }),
  ];
  const hits = matches('Doctor Doom shows up in GTA 6?!', rules);
  assert.deepEqual(hits, [{ id: 'a', name: 'Avengers: Doomsday' }, { id: 'b', name: 'GTA VI' }]);
  for (const hit of hits) assert.deepEqual(Object.keys(hit).sort(), ['id', 'name']);
});

test('disabled rules do not match', () => {
  assert.equal(matches('Avengers Doomsday', [rule({ enabled: false })]).length, 0);
});

test('expiry: active before, inactive after, same as a disabled rule', () => {
  const r = rule({ expiresAt: NOW + HOUR });
  assert.equal(SG.isRuleActive(r, NOW), true);
  assert.equal(SG.isRuleActive(r, NOW + HOUR), false);
  assert.equal(matches('Avengers Doomsday', [r], NOW).length, 1);
  assert.equal(matches('Avengers Doomsday', [r], NOW + HOUR + 1).length, 0);
  assert.equal(SG.ruleStatus(r, NOW + HOUR), 'expired');
  assert.deepEqual(
    SG.compileRules([r], NOW + HOUR),
    SG.compileRules([rule({ enabled: false })], NOW),
  );
});

test('rules without an expiry stay active indefinitely', () => {
  assert.equal(SG.isRuleActive(rule(), NOW + 1000 * 24 * HOUR), true);
});

test('nextExpiry finds the soonest future expiry of enabled rules', () => {
  const rules = [
    rule({ id: 'a', expiresAt: NOW + 3 * HOUR }),
    rule({ id: 'b', expiresAt: NOW + HOUR }),
    rule({ id: 'c', expiresAt: NOW + HOUR / 2, enabled: false }),
    rule({ id: 'd', expiresAt: NOW - HOUR }),
    rule({ id: 'e', expiresAt: null }),
  ];
  assert.equal(SG.nextExpiry(rules, NOW), NOW + HOUR);
  assert.equal(SG.nextExpiry([rule()], NOW), null);
});

test('validateRuleInput requires a name and keywords, dedupes, and warns', () => {
  const empty = SG.validateRuleInput({ name: ' ', keywords: ['  '] }, NOW);
  assert.equal(empty.errors.length, 2);

  const ok = SG.validateRuleInput(
    { name: 'Avengers', keywords: ['Avengers Doomsday', 'avengers: doomsday', '', 'Doom', 'MCU'] },
    NOW,
  );
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.value.keywords, ['Avengers Doomsday', 'Doom', 'MCU']);
  assert.match(ok.warnings.join(' '), /MCU/);
  assert.doesNotMatch(ok.warnings.join(' '), /Doom/);

  const past = SG.validateRuleInput({ name: 'x', keywords: ['xyzzy'], expiresAt: NOW - 1 }, NOW);
  assert.match(past.warnings.join(' '), /past/);
});
