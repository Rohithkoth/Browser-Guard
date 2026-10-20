(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  // Helpers platform files use to pull a card's title, channel and upload time
  // for the cover. Each returns '' when nothing is found, and the cover just
  // leaves that part out.

  function textOf(el) {
    if (!el) return '';
    const text = el.getAttribute('title') || el.textContent || el.getAttribute('aria-label') || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  // First non-empty text among the selectors, tried in order.
  function firstText(card, selectors) {
    for (const selector of selectors) {
      for (const el of card.querySelectorAll(selector)) {
        if (el.classList.contains(SG.overlay.HOST_CLASS)) continue;
        const text = textOf(el);
        if (text) return text;
      }
    }
    return '';
  }

  // Upload time in YouTube's English wording, long or short form:
  // "3 days ago", "Streamed 2 weeks ago", "5h ago", "3d ago", "2mo ago", "1y ago".
  // Other interface languages won't show an upload time.
  const AGE = new RegExp(
    '(?:streamed\\s+|premiered\\s+)?\\b\\d+\\s*' +
      '(?:seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)' +
      '\\s+ago\\b',
    'i',
  );

  function findAge(card, selectors) {
    for (const el of card.querySelectorAll(selectors.join(', '))) {
      const m = AGE.exec(el.textContent || '');
      if (m) return m[0].replace(/\s+/g, ' ');
    }
    return '';
  }

  SG.details = { textOf, firstText, findAge };
})(globalThis);
