(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  const CHECKED_ATTR = 'data-sg-checked';
  const WATCHED_ATTRIBUTES = ['title', 'aria-label', 'alt', 'href'];

  // Default text extraction: the card's visible text plus the accessible text
  // (aria-label, title, image alt) that titles and captions are often stored in.
  // Overlay text lives in a closed shadow root, so it never shows up here.
  function collectText(card) {
    const parts = [card.textContent || ''];
    for (const el of card.querySelectorAll('[aria-label], [title], img[alt]')) {
      if (el.classList.contains(SG.overlay.HOST_CLASS)) continue;
      const label = el.getAttribute('aria-label');
      const title = el.getAttribute('title');
      const alt = el.tagName === 'IMG' ? el.getAttribute('alt') : null;
      if (label) parts.push(label);
      if (title) parts.push(title);
      if (alt) parts.push(alt);
    }
    return parts.join(' \n ');
  }

  // adapter: { name, cardSelector, getText?(card) }
  function createScanner(adapter, doc) {
    doc = doc || root.document;
    const getText = adapter.getText || collectText;
    let compiled = [];
    let generation = 0;
    let observer = null;
    // Last text and rule generation seen per card. YouTube reuses card elements
    // for different videos, so a card is re-checked whenever its text changes.
    const seen = new WeakMap();

    function outermostCard(el) {
      // Some sites nest card elements (e.g. a lockup inside a grid item). Only
      // the outermost card gets an overlay, so there's never a double overlay.
      let card = el.closest(adapter.cardSelector);
      if (!card) return null;
      let parent = card.parentElement && card.parentElement.closest(adapter.cardSelector);
      while (parent) {
        card = parent;
        parent = card.parentElement && card.parentElement.closest(adapter.cardSelector);
      }
      return card;
    }

    function processCard(card) {
      try {
        const text = getText(card);
        const prev = seen.get(card);
        if (prev && prev.text === text && prev.generation === generation) return;
        seen.set(card, { text, generation });

        const hits = compiled.length ? SG.matchText(text, compiled) : [];
        if (hits.length) SG.overlay.conceal(card, hits);
        else if (SG.overlay.isConcealed(card)) SG.overlay.reveal(card);
      } catch (err) {
        console.warn('[Spoiler Guard] failed to check an item', err);
      } finally {
        // Always mark checked, so the pre-hide CSS lifts even if checking failed.
        // Nested card elements are marked too: they're checked as part of their
        // outer card, and the pre-hide CSS would otherwise hide them forever.
        if (!card.hasAttribute(CHECKED_ATTR)) card.setAttribute(CHECKED_ATTR, '');
        for (const inner of card.querySelectorAll(adapter.cardSelector)) {
          if (!inner.hasAttribute(CHECKED_ATTR)) inner.setAttribute(CHECKED_ATTR, '');
        }
      }
    }

    function collectCards(mutations) {
      const cards = new Set();
      const add = (el) => {
        const card = el && outermostCard(el);
        if (card) cards.add(card);
      };
      for (const m of mutations) {
        if (m.type === 'characterData') {
          add(m.target.parentElement);
        } else if (m.type === 'attributes') {
          if (m.target.classList && m.target.classList.contains(SG.overlay.HOST_CLASS)) continue;
          add(m.target);
        } else {
          if (m.target.nodeType === 1) add(m.target);
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.classList.contains(SG.overlay.HOST_CLASS)) continue;
            add(node);
            for (const inner of node.querySelectorAll(adapter.cardSelector)) add(inner);
          }
        }
      }
      return cards;
    }

    // MutationObserver callbacks run before the browser paints, so new or
    // changed cards are checked before they first appear on screen.
    function onMutations(mutations) {
      for (const card of collectCards(mutations)) processCard(card);
    }

    function scanAll() {
      const cards = new Set();
      for (const el of doc.querySelectorAll(adapter.cardSelector)) cards.add(outermostCard(el));
      for (const card of cards) processCard(card);
    }

    function startObserving() {
      if (observer) return;
      observer = new MutationObserver(onMutations);
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: WATCHED_ATTRIBUTES,
      });
    }

    function stopObserving() {
      if (observer) observer.disconnect();
      observer = null;
    }

    // Called on startup and whenever rules change, are toggled, or expire.
    function setRules(compiledRules) {
      compiled = compiledRules;
      generation++;
      if (compiled.length) {
        startObserving();
        scanAll();
      } else {
        // Nothing to match: reveal anything still concealed and stop observing
        // so the extension costs nothing while idle.
        stopObserving();
        for (const card of doc.querySelectorAll('.' + SG.overlay.CONCEALED_CLASS)) {
          SG.overlay.reveal(card);
        }
      }
    }

    return { setRules, scanAll, stop: stopObserving };
  }

  SG.createScanner = createScanner;
  SG.collectText = collectText;
})(globalThis);
