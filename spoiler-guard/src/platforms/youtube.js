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

  SG.platforms = SG.platforms || {};
  SG.platforms.youtube = {
    name: 'youtube',
    matchesHost: (host) => host === 'www.youtube.com' || host === 'youtube.com',
    cardSelector: CARD_SELECTORS.join(', '),
  };
})(globalThis);
