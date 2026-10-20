(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  // Instagram's class names are generated and change constantly, so cards are
  // found by structure and link shape instead:
  //   article                    a post in the home feed or post dialog
  //   a[href*="/p/"], /reel/     a tile in Explore, profile, hashtag and search grids
  // A tile inside an article is part of that post, so only the article is covered.
  // No :has() here: it's comparatively expensive to evaluate on every page change.
  // A text-only link to a post is harmless to check; it just never matches.
  const CARD_SELECTORS = [
    'article',
    'a[href*="/p/"]',
    'a[href*="/reel/"]',
  ];

  // Feed posts: author link in the post header, caption in an h1, time in a
  // <time> element ("2d"). Grid tiles only carry an image description.
  function postAge(card) {
    const time = card.querySelector('time');
    if (!time) return '';
    return SG.details.textOf(time) || '';
  }

  function imageDescription(card) {
    const img = card.querySelector('img[alt]:not([alt=""])');
    return img ? img.getAttribute('alt').trim() : '';
  }

  SG.platforms = SG.platforms || {};
  SG.platforms.instagram = {
    name: 'instagram',
    matchesHost: (host) => host === 'www.instagram.com' || host === 'instagram.com',
    cardSelector: CARD_SELECTORS.join(', '),
    getDetails: (card) => ({
      title: SG.details.firstText(card, ['h1']) || imageDescription(card),
      channel: SG.details.firstText(card, ['header a[href^="/"]']),
      age: postAge(card),
    }),
  };
})(globalThis);
