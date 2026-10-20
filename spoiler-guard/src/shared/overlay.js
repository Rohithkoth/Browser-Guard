(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  const CONCEALED_CLASS = 'sg-concealed';
  const RELATIVE_CLASS = 'sg-relative';
  const HOST_CLASS = 'sg-overlay-host';
  // How long the "Click again to show title" confirmation stays armed.
  const CONFIRM_MS = 3000;

  // Events stopped at the overlay so the hidden item can't be opened, hovered
  // into an autoplay preview, or otherwise interacted with through it.
  const BLOCKED_EVENTS = [
    'click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'mouseover', 'mouseenter', 'pointerover', 'pointerenter', 'touchstart', 'touchend',
  ];
  // Cancelling touch events would also cancel the click that touch screens
  // synthesize, which would make the reveal button unusable by touch.
  const NO_PREVENT_DEFAULT = new Set(['touchstart', 'touchend']);

  // Lives in a shadow root so site CSS can't restyle or reveal it.
  const OVERLAY_CSS = `
    :host { all: initial; }
    .box {
      position: absolute; inset: 0; z-index: 2147483000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; padding: 6px 10px; box-sizing: border-box; overflow: hidden;
      background: #16161a; color: #f2f2f2; border-radius: inherit;
      font: 500 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
      text-align: center; cursor: default; user-select: none;
    }
    .brand { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .55; }
    .rules, .meta, .shown-title { max-width: 100%; overflow-wrap: anywhere; overflow: hidden;
      display: -webkit-box; -webkit-box-orient: vertical; }
    .rules { font-weight: 700; -webkit-line-clamp: 2; }
    .meta { font-size: 11px; opacity: .75; -webkit-line-clamp: 1; }
    .shown-title { font-size: 12px; -webkit-line-clamp: 3; padding: 4px 6px; border-radius: 6px;
      background: #26262d; user-select: text; }
    [hidden] { display: none !important; }
    button {
      margin-top: 3px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
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

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  // Reveal happens in two steps so you can decide with more information:
  //   1. "Show title" (needs a second click within CONFIRM_MS, so a stray click
  //      can't spoil anything) puts the title on the cover; the thumbnail stays hidden.
  //   2. "Show video" removes the cover.
  // Cards with no title found skip step 1: "Show anyway" + confirm reveals everything.
  function wireButton(host, onReveal) {
    const button = host._sg.button;
    let armed = false;
    let timer = null;

    function render() {
      const state = host._sg;
      const confirming = armed;
      button.classList.toggle('confirm', confirming);
      if (state.stage === 'title-shown') button.textContent = 'Show video';
      else if (state.details.title) button.textContent = confirming ? 'Click again to show title' : 'Show title';
      else button.textContent = confirming ? 'Click again to show' : 'Show anyway';
    }

    function disarm() {
      clearTimeout(timer);
      timer = null;
      armed = false;
      render();
    }

    button.addEventListener('click', () => {
      const state = host._sg;
      if (state.stage === 'title-shown') {
        onReveal();
        return;
      }
      if (!armed) {
        armed = true;
        timer = setTimeout(disarm, CONFIRM_MS);
        render();
        return;
      }
      disarm();
      if (state.details.title) {
        state.stage = 'title-shown';
        state.titleEl.textContent = state.details.title;
        state.titleEl.hidden = false;
        render();
      } else {
        onReveal();
      }
    });
    host._sg.render = render;
    render();
  }

  function buildHost(rules, details, onReveal) {
    const host = document.createElement('div');
    host.className = HOST_CLASS;
    host.setAttribute('role', 'group');
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = make('style');
    style.textContent = OVERLAY_CSS;
    const box = make('div', 'box');
    const names = make('div', 'rules');
    const meta = make('div', 'meta');
    const titleEl = make('div', 'shown-title');
    titleEl.hidden = true;
    box.append(make('div', 'brand', 'Spoiler Guard'), names, meta, titleEl);

    host._sg = { names, meta, titleEl, stage: 'covered', details: {}, button: null, render: () => {} };
    if (onReveal) {
      host._sg.button = make('button');
      host._sg.button.type = 'button';
      box.append(host._sg.button);
    }
    shadow.append(style, box);

    for (const type of BLOCKED_EVENTS) {
      host.addEventListener(type, (e) => {
        e.stopPropagation();
        if (e.cancelable && !NO_PREVENT_DEFAULT.has(type)) e.preventDefault();
      });
    }

    updateHost(host, rules, details);
    if (onReveal) wireButton(host, onReveal);
    return host;
  }

  // textContent only: rule names, channel names and titles are shown as plain
  // text, never parsed as HTML.
  function updateHost(host, rules, details) {
    const state = host._sg;
    state.details = details || {};
    state.names.textContent = 'Blocked: ' + rules.map((r) => r.name).join(', ');
    const meta = [state.details.channel, state.details.age].filter(Boolean).join(' · ');
    state.meta.textContent = meta;
    state.meta.hidden = !meta;
    if (state.stage === 'title-shown') state.titleEl.textContent = state.details.title || '';
    host.setAttribute('aria-label', describe(rules));
    host.title = describe(rules);
    host.dataset.sgRules = ruleKey(rules);
    state.render();
  }

  // options: { details: { title, channel, age }, onReveal }. Without onReveal
  // the cover has no reveal button.
  function conceal(card, rules, options) {
    const { details = {}, onReveal = null } = options || {};
    let host = findHost(card);
    if (host) {
      updateHost(host, rules, details);
    } else {
      // Only cards that aren't already positioned get position: relative, so
      // absolutely positioned tiles keep their layout.
      if (!card.classList.contains(RELATIVE_CLASS) && getComputedStyle(card).position === 'static') {
        card.classList.add(RELATIVE_CLASS);
      }
      host = buildHost(rules, details, onReveal);
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

  SG.overlay = { conceal, reveal, isConcealed, findHost, HOST_CLASS, CONCEALED_CLASS };
})(globalThis);
