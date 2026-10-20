(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  const CONCEALED_CLASS = 'sg-concealed';
  const RELATIVE_CLASS = 'sg-relative';
  const HOST_CLASS = 'sg-overlay-host';

  // Events stopped at the overlay so the hidden item can't be opened, hovered
  // into an autoplay preview, or otherwise interacted with through it.
  const BLOCKED_EVENTS = [
    'click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'mouseover', 'mouseenter', 'pointerover', 'pointerenter', 'touchstart', 'touchend',
  ];

  // Lives in a shadow root so site CSS can't restyle or reveal it.
  const OVERLAY_CSS = `
    :host { all: initial; }
    .box {
      position: absolute; inset: 0; z-index: 2147483000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 4px; padding: 8px; box-sizing: border-box; overflow: hidden;
      background: #16161a; color: #f2f2f2; border-radius: inherit;
      font: 500 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
      text-align: center; cursor: default; user-select: none;
    }
    .title { font-weight: 700; font-size: 13px; letter-spacing: .02em; }
    .rules { opacity: .85; max-width: 100%; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  `;

  function describe(rules) {
    return 'Blocked by Spoiler Guard: ' + rules.map((r) => r.name).join(', ');
  }

  function ruleKey(rules) {
    return rules.map((r) => r.id).sort().join('|');
  }

  function findHost(card) {
    for (const child of card.children) {
      if (child.classList.contains(HOST_CLASS)) return child;
    }
    return null;
  }

  function buildHost(rules) {
    const host = document.createElement('div');
    host.className = HOST_CLASS;
    host.setAttribute('role', 'img');
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    const box = document.createElement('div');
    box.className = 'box';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Spoiler Guard';
    const names = document.createElement('div');
    names.className = 'rules';
    box.append(title, names);
    shadow.append(style, box);

    for (const type of BLOCKED_EVENTS) {
      host.addEventListener(type, (e) => {
        e.stopPropagation();
        if (e.cancelable && type !== 'touchstart') e.preventDefault();
      });
    }

    host._sgNames = names;
    updateHost(host, rules);
    return host;
  }

  function updateHost(host, rules) {
    // textContent only: rule names are shown as plain text, never parsed as HTML.
    host._sgNames.textContent = 'Blocked: ' + rules.map((r) => r.name).join(', ');
    host.setAttribute('aria-label', describe(rules));
    host.title = describe(rules);
    host.dataset.sgRules = ruleKey(rules);
  }

  function conceal(card, rules) {
    let host = findHost(card);
    if (host) {
      if (host.dataset.sgRules !== ruleKey(rules)) updateHost(host, rules);
    } else {
      // Only cards that aren't already positioned get position: relative, so
      // absolutely positioned tiles keep their layout.
      if (!card.classList.contains(RELATIVE_CLASS) && getComputedStyle(card).position === 'static') {
        card.classList.add(RELATIVE_CLASS);
      }
      host = buildHost(rules);
      card.prepend(host);
    }
    card.classList.add(CONCEALED_CLASS);
  }

  function reveal(card) {
    const host = findHost(card);
    if (host) host.remove();
    card.classList.remove(CONCEALED_CLASS, RELATIVE_CLASS);
  }

  function isConcealed(card) {
    return card.classList.contains(CONCEALED_CLASS);
  }

  SG.overlay = { conceal, reveal, isConcealed, HOST_CLASS, CONCEALED_CLASS };
})(globalThis);
