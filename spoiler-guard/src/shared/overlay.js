(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  const CONCEALED_CLASS = 'sg-concealed';
  const RELATIVE_CLASS = 'sg-relative';
  const HOST_CLASS = 'sg-overlay-host';
  // How long the "Click again to show" confirmation stays armed.
  const CONFIRM_MS = 3000;

  // Events stopped at the overlay so the hidden item can't be opened, hovered
  // into an autoplay preview, or otherwise interacted with through it.
  const BLOCKED_EVENTS = [
    'click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'mouseover', 'mouseenter', 'pointerover', 'pointerenter', 'touchstart', 'touchend',
  ];
  // Cancelling touch events would also cancel the click that touch screens
  // synthesize, which would make the "Show anyway" button unusable by touch.
  const NO_PREVENT_DEFAULT = new Set(['touchstart', 'touchend']);

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
    button {
      margin-top: 4px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
      font: 600 11px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #f2f2f2; background: transparent; border: 1px solid #5a5a66;
    }
    button:hover { border-color: #9a9aa6; }
    button.confirm { background: #f2f2f2; color: #16161a; border-color: #f2f2f2; }
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

  // Two clicks are needed so a stray click can't reveal a spoiler: the first
  // arms the button, the second (within CONFIRM_MS) reveals the item.
  function buildRevealButton(onReveal) {
    const button = document.createElement('button');
    button.type = 'button';
    let timer = null;
    const disarm = () => {
      clearTimeout(timer);
      timer = null;
      button.textContent = 'Show anyway';
      button.classList.remove('confirm');
    };
    button.addEventListener('click', () => {
      if (timer === null) {
        button.textContent = 'Click again to show';
        button.classList.add('confirm');
        timer = setTimeout(disarm, CONFIRM_MS);
      } else {
        disarm();
        onReveal();
      }
    });
    disarm();
    return button;
  }

  function buildHost(rules, onReveal) {
    const host = document.createElement('div');
    host.className = HOST_CLASS;
    host.setAttribute('role', 'group');
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
    if (onReveal) {
      host._sgButton = buildRevealButton(onReveal);
      box.append(host._sgButton);
    }
    shadow.append(style, box);

    for (const type of BLOCKED_EVENTS) {
      host.addEventListener(type, (e) => {
        e.stopPropagation();
        if (e.cancelable && !NO_PREVENT_DEFAULT.has(type)) e.preventDefault();
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

  // onReveal is optional; when given, the overlay shows a "Show anyway" button.
  function conceal(card, rules, onReveal) {
    let host = findHost(card);
    if (host) {
      if (host.dataset.sgRules !== ruleKey(rules)) updateHost(host, rules);
    } else {
      // Only cards that aren't already positioned get position: relative, so
      // absolutely positioned tiles keep their layout.
      if (!card.classList.contains(RELATIVE_CLASS) && getComputedStyle(card).position === 'static') {
        card.classList.add(RELATIVE_CLASS);
      }
      host = buildHost(rules, onReveal);
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
