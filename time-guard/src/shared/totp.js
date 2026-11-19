(function (root) {
  const TG = (root.TimeGuard = root.TimeGuard || {});

  // Time-based one-time passwords (RFC 6238), the same scheme authenticator apps
  // use: HMAC-SHA1 over a 30-second counter, shown as 6 digits. Everything runs
  // locally with the browser's built-in WebCrypto.

  const STEP_SECONDS = 30;
  const DIGITS = 6;
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Encode(bytes) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
  }

  function base32Decode(text) {
    const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of clean) {
      const index = ALPHABET.indexOf(ch);
      if (index < 0) throw new Error('Invalid character in key: ' + ch);
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  // 20 random bytes (160 bits), the size RFC 4226 recommends for SHA-1.
  function generateSecret() {
    const bytes = new Uint8Array(20);
    root.crypto.getRandomValues(bytes);
    return base32Encode(bytes);
  }

  function counterAt(ms) {
    return Math.floor(ms / 1000 / STEP_SECONDS);
  }

  async function hotp(secretBytes, counter, digits = DIGITS) {
    const message = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
      message[i] = c & 0xff;
      c = Math.floor(c / 256);
    }
    const key = await root.crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const mac = new Uint8Array(await root.crypto.subtle.sign('HMAC', key, message));
    const offset = mac[mac.length - 1] & 0x0f;
    const binary =
      ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
    return String(binary % 10 ** digits).padStart(digits, '0');
  }

  // Checks a 6-digit code against the current 30-second window and one window
  // either side (phone clocks drift a little). Returns the matching counter, or
  // null. Codes at or before lastCounter are rejected, so a code that was just
  // used can't be used again.
  async function verifyCode(secret, code, now, lastCounter = -1) {
    const digits = String(code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(digits)) return null;
    const bytes = base32Decode(secret);
    const current = counterAt(now);
    for (const counter of [current, current - 1, current + 1]) {
      if (counter <= lastCounter) continue;
      if ((await hotp(bytes, counter)) === digits) return counter;
    }
    return null;
  }

  // The link authenticator apps understand; shown as a QR code at setup.
  function otpauthUri(secret, account = 'Chrome', issuer = 'Time Guard') {
    const label = encodeURIComponent(`${issuer}:${account}`);
    const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
    return `otpauth://totp/${label}?${params}`;
  }

  // For display: "JBSW Y3DP EHPK 3PXP".
  function groupKey(secret) {
    return secret.replace(/(.{4})/g, '$1 ').trim();
  }

  Object.assign(TG, { base32Encode, base32Decode, generateSecret, counterAt, hotp, verifyCode, otpauthUri, groupKey, STEP_SECONDS });
  if (typeof module !== 'undefined') module.exports = TG;
})(globalThis);
