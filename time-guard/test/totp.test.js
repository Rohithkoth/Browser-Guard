const test = require('node:test');
const assert = require('node:assert/strict');
const TG = require('../src/shared/totp.js');

// RFC 6238 Appendix B: SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = TG.base32Encode(new TextEncoder().encode('12345678901234567890'));
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

test('base32 round-trips and matches the RFC 4648 example', () => {
  assert.equal(TG.base32Encode(new TextEncoder().encode('foobar')), 'MZXW6YTBOI');
  assert.deepEqual([...TG.base32Decode('MZXW6YTBOI')], [...new TextEncoder().encode('foobar')]);
  assert.deepEqual([...TG.base32Decode('mzxw 6ytb oi==')], [...new TextEncoder().encode('foobar')]);
  assert.throws(() => TG.base32Decode('MZ1W'), /Invalid character/);
});

test('HOTP/TOTP matches the RFC 6238 test vectors', async () => {
  const bytes = TG.base32Decode(RFC_SECRET);
  for (const [seconds, expected] of RFC_VECTORS) {
    assert.equal(await TG.hotp(bytes, TG.counterAt(seconds * 1000), 8), expected, `T=${seconds}`);
    assert.equal(await TG.hotp(bytes, TG.counterAt(seconds * 1000)), expected.slice(2), `6-digit T=${seconds}`);
  }
});

test('verifyCode accepts the current code and one window of drift either side', async () => {
  const now = 1111111111 * 1000;
  const bytes = TG.base32Decode(RFC_SECRET);
  const c = TG.counterAt(now);
  assert.equal(await TG.verifyCode(RFC_SECRET, '050471', now), c);
  assert.equal(await TG.verifyCode(RFC_SECRET, await TG.hotp(bytes, c - 1), now), c - 1);
  assert.equal(await TG.verifyCode(RFC_SECRET, await TG.hotp(bytes, c + 1), now), c + 1);
  assert.equal(await TG.verifyCode(RFC_SECRET, await TG.hotp(bytes, c - 2), now), null, 'too old');
  assert.equal(await TG.verifyCode(RFC_SECRET, await TG.hotp(bytes, c + 2), now), null, 'too far ahead');
});

test('verifyCode rejects wrong, malformed and already-used codes', async () => {
  const now = 1111111111 * 1000;
  const c = TG.counterAt(now);
  assert.equal(await TG.verifyCode(RFC_SECRET, '000000', now), null);
  assert.equal(await TG.verifyCode(RFC_SECRET, '05047', now), null);
  assert.equal(await TG.verifyCode(RFC_SECRET, 'abcdef', now), null);
  assert.equal(await TG.verifyCode(RFC_SECRET, '050 471', now), c, 'spaces are ignored');
  assert.equal(await TG.verifyCode(RFC_SECRET, '050471', now, c), null, 'replayed code');
});

test('generated secrets are 160-bit, base32, and different each time', () => {
  const a = TG.generateSecret();
  const b = TG.generateSecret();
  assert.match(a, /^[A-Z2-7]{32}$/);
  assert.equal(TG.base32Decode(a).length, 20);
  assert.notEqual(a, b);
});

test('otpauth link has what authenticator apps expect', () => {
  const uri = TG.otpauthUri('JBSWY3DPEHPK3PXP');
  assert.match(uri, /^otpauth:\/\/totp\/Time%20Guard%3AChrome\?/);
  const params = new URL(uri.replace('otpauth:', 'http:')).searchParams;
  assert.equal(params.get('secret'), 'JBSWY3DPEHPK3PXP');
  assert.equal(params.get('issuer'), 'Time Guard');
  assert.equal(params.get('digits'), '6');
  assert.equal(params.get('period'), '30');
  assert.equal(TG.groupKey('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
});
