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

  // Which video or post a card is showing, from its link: /watch?v=ID,
  // /shorts/ID, /p/ID or /reel/ID. One querySelector, so it's cheap enough to
  // run on every change, unlike reading the card's full text.
  const CONTENT_ID = /(?:[?&]v=|\/shorts\/|\/p\/|\/reel\/)([\w-]+)/;
  const CONTENT_LINK = 'a[href*="v="], a[href*="/shorts/"], a[href*="/p/"], a[href*="/reel/"]';

  function contentId(card) {
    const link = card.tagName === 'A' ? card : card.querySelector(CONTENT_LINK);
    const m = link && CONTENT_ID.exec(link.getAttribute('href') || '');
    return m ? m[1] : '';
  }

  function isOverlayHost(node) {
    return node.nodeType === 1 && node.classList.contains(SG.overlay.HOST_CLASS);
  }

  // adapter: { name, cardSelector, getText?(card) }
  function createScanner(adapter, doc) {
    doc = doc || root.document;
    const win = doc.defaultView || root;
    const getText = adapter.getText || collectText;
    let compiled = [];
    let rulesSignature = '';
    let generation = 0;
    let observer = null;
    // Per card: the text and content id last checked, and the rule generation.
    // YouTube reuses card elements for different videos, so a card is re-checked
    // whenever its text changes, not just when it's first added.
    const seen = new WeakMap();
    // Cards you chose to "Show anyway", keyed to the video/post they showed. The
    // choice lasts until the card shows a different video or post, or the page reloads.
    const shownAnyway = new WeakMap();
    // Cards waiting to be checked in the next animation frame.
    const pending = new Set();
    let frameRequested = false;

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
        const id = contentId(card) || SG.normalize(text);
        seen.set(card, { text, id, generation });

        if (shownAnyway.has(card) && shownAnyway.get(card) !== id) shownAnyway.delete(card);

        const hits = compiled.length && !shownAnyway.has(card) ? SG.matchText(text, compiled) : [];
        if (hits.length) {
          SG.overlay.conceal(card, hits, () => {
            shownAnyway.set(card, seen.get(card).id);
            SG.overlay.reveal(card);
          });
        } else if (SG.overlay.isConcealed(card)) {
          SG.overlay.reveal(card);
        }
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
          if (!isOverlayHost(m.target)) add(m.target);
        } else {
          // Our own overlay being added or removed isn't a content change.
          const nodes = [...m.addedNodes, ...m.removedNodes];
          if (nodes.length && nodes.every(isOverlayHost)) continue;
          if (m.target.nodeType === 1) add(m.target);
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1 || isOverlayHost(node)) continue;
            add(node);
            for (const inner of node.querySelectorAll(adapter.cardSelector)) add(inner);
          }
        }
      }
      return cards;
    }

    // Checks are batched to once per card per frame. Animation frames run just
    // before the browser paints, so a card is still checked before it's shown,
    // and they pause in background tabs, so hidden tabs do no work at all.
    function flush() {
      frameRequested = false;
      const cards = [...pending];
      pending.clear();
      for (const card of cards) if (card.isConnected) processCard(card);
    }

    function schedule(card) {
      pending.add(card);
      if (!frameRequested) {
        frameRequested = true;
        (win.requestAnimationFrame || win.setTimeout).call(win, flush);
      }
    }

    function onMutations(mutations) {
      for (const card of collectCards(mutations)) {
        const prev = seen.get(card);
        // A checked card that now shows a different video (YouTube reusing the
        // element) is re-checked right away, so the new thumbnail can't show for
        // even one frame. New cards are kept hidden by the pre-hide CSS until
        // checked, and other changes can wait for the next frame.
        if (prev && prev.id !== (contentId(card) || prev.id)) processCard(card);
        else schedule(card);
      }
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
      pending.clear();
    }

    function signatureOf(rules) {
      return JSON.stringify(rules.map((r) => [r.id, r.name, r.matchers]));
    }

    // Called on startup and whenever rules change, are toggled, start or end.
    function setRules(compiledRules) {
      const signature = signatureOf(compiledRules);
      // Same rules as before: every card's result would be identical, so skip
      // the full re-scan.
      if (signature === rulesSignature && (observer || !compiledRules.length)) return;
      rulesSignature = signature;
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
