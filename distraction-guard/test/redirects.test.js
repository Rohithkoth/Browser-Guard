const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldRedirect } = require('../instagram-redirects.js');

test('Explore is redirected, with or without the trailing slash', () => {
  assert.equal(shouldRedirect('/explore/'), true);
  assert.equal(shouldRedirect('/explore'), true);
  assert.equal(shouldRedirect('/Explore/'), true);
});

test('hashtag, location and other pages are left alone', () => {
  for (const path of ['/explore/tags/cats/', '/explore/locations/123/', '/', '/direct/inbox/', '/reels/', '/someuser/', '/p/ABC/']) {
    assert.equal(shouldRedirect(path), false, path);
  }
});
