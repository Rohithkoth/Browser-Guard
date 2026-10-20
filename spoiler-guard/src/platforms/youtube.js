(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  // Every element YouTube currently uses for a video, Short or playlist card.
  // YouTube renames these from time to time; when a card stops being covered,
  // inspect it in DevTools and add its tag name here.
  const CARD_SELECTORS = [
    'ytd-rich-item-renderer',            // home / subscriptions grid item
    'ytd-video-renderer',                // search result
    'ytd-compact-video-renderer',        // watch-page sidebar (older layout)
    'ytd-grid-video-renderer',           // channel video grid (older layout)
    'ytd-playlist-video-renderer',       // playlist page row
    'ytd-reel-item-renderer',            // Short (older layout)
    'yt-lockup-view-model',              // newer layout used across home, search, sidebar
    'ytm-shorts-lockup-view-model',      // Short (newer layout)
    'ytm-shorts-lockup-view-model-v2',
    'ytd-playlist-renderer',             // playlist card in search
    'ytd-radio-renderer',                // mix card in search
  ];

  // Where the details shown on a cover live, newest layout first. As with the
  // card list, update these if the cover stops showing a title or channel.
  const TITLE_SELECTORS = [
    '.yt-lockup-metadata-view-model__title',
    'a#video-title-link',
    '#video-title',
    'h3 a[title]',
    'h3',
  ];
  const CHANNEL_SELECTORS = [
    'ytd-channel-name a',
    'ytd-channel-name #text',
    '.yt-content-metadata-view-model__metadata-row:first-child a',
    '.yt-content-metadata-view-model__metadata-row:first-child .yt-content-metadata-view-model__metadata-text',
    'a[href^="/@"]:not(:has(img))',
    'a[href^="/channel/"]:not(:has(img))',
  ];
  const AGE_SELECTORS = [
    '#metadata-line span',
    '.yt-content-metadata-view-model__metadata-row',
    '.yt-content-metadata-view-model__metadata-text',
    'span',
  ];

  SG.platforms = SG.platforms || {};
  SG.platforms.youtube = {
    name: 'youtube',
    matchesHost: (host) => host === 'www.youtube.com' || host === 'youtube.com',
    cardSelector: CARD_SELECTORS.join(', '),
    getDetails: (card) => ({
      title: SG.details.firstText(card, TITLE_SELECTORS),
      channel: SG.details.firstText(card, CHANNEL_SELECTORS),
      age: SG.details.findAge(card, AGE_SELECTORS),
    }),
  };
})(globalThis);
