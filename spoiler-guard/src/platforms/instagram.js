(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  // Instagram's class names are generated and change constantly, so cards are
  // found by structure and link shape instead:
  //   article                    a post in the home feed or post dialog
  //   a[href*="/p/"], /reel/     a tile in Explore, profile, hashtag and search grids
  // A tile inside an article is part of that post, so only the article is covered.
  const CARD_SELECTORS = [
    'article',
    'a[href*="/p/"]:has(img)',
    'a[href*="/reel/"]:has(img)',
  ];

  SG.platforms = SG.platforms || {};
  SG.platforms.instagram = {
    name: 'instagram',
    matchesHost: (host) => host === 'www.instagram.com' || host === 'instagram.com',
    cardSelector: CARD_SELECTORS.join(', '),
  };
})(globalThis);
