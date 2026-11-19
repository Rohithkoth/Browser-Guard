(function () {
  const TG = globalThis.TimeGuard;
  const { el, send, showMessages } = TG;
  const $ = (id) => document.getElementById(id);

  let saved = null;   // config as stored
  let draft = null;   // config being edited
  let setUp = false;
  let replacing = false;

  const clone = (c) => JSON.parse(JSON.stringify(c));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---- setup ----
  async function beginSetup(code) {
    const r = await send('setupBegin', { code });
    if (r.error) return r;
    $('setup').hidden = false;
    $('setup-title').textContent = setUp ? 'Set up your new authenticator' : 'Set up your unlock codes';
    $('setup-cancel').hidden = !setUp;
    TG.drawQr($('qr'), r.uri);
    $('setup-key').textContent = TG.groupKeyText(r.secret);
    $('confirm-code').value = '';
    $('confirm-code').focus();
    showMessages($('setup-messages'), [], '');
    return r;
  }

  $('confirm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await send('setupConfirm', { code: $('confirm-code').value });
    if (r.error) return showMessages($('setup-messages'), [r.error], 'error');
    // Clear the key off the page right away.
    $('setup-key').textContent = '';
    $('qr').getContext('2d').clearRect(0, 0, 296, 296);
    $('setup').hidden = true;
    replacing = false;
    await load();
    showMessages($('limit-messages'), [setUp ? 'Authenticator set up. Add the sites you want to limit.' : ''], 'success');
  });

  $('setup-cancel').addEventListener('click', async () => {
    await send('setupCancel');
    $('setup').hidden = true;
    $('setup-key').textContent = '';
    replacing = false;
    render();
  });

  $('replace-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await beginSetup($('replace-code').value);
    $('replace-code').value = '';
    if (r.error) return showMessages($('replace-messages'), [r.error], 'error');
    replacing = true;
    showMessages($('replace-messages'), [], '');
    $('setup').scrollIntoView({ behavior: 'smooth' });
  });

  // ---- limits editor ----
  function renderSites() {
    const list = $('site-list');
    if (!draft.sites.length) {
      list.replaceChildren(el('p', { className: 'empty', textContent: 'No sites limited yet. Add one below.' }));
      return;
    }
    list.replaceChildren(
      ...draft.sites.map((site, i) => {
        const minutes = el('input', { type: 'number', min: 1, max: 1440, value: site.limitMin, ariaLabel: `Daily minutes for ${site.domain}` });
        minutes.addEventListener('input', () => {
          draft.sites[i].limitMin = minutes.value === '' ? '' : Number(minutes.value);
          updateDirty();
        });
        const remove = el('button', {
          type: 'button',
          className: 'ghost danger',
          textContent: 'Remove',
          onclick: () => {
            draft.sites.splice(i, 1);
            render();
          },
        });
        return el('div', { className: 'site' }, [
          el('span', { className: 'name', textContent: site.domain }),
          minutes,
          el('span', { className: 'muted', textContent: 'min/day' }),
          remove,
        ]);
      }),
    );
  }

  function updateDirty() {
    const dirty = !same(saved, draft);
    $('dirty-note').hidden = !dirty;
    $('save').disabled = !dirty;
    $('discard').disabled = !dirty;
    // Hide the code box once the edit no longer loosens anything.
    const reasons = TG.looseningChanges(saved, normalized(draft));
    if (!reasons.length) $('gate').hidden = true;
  }

  function normalized(config) {
    return TG.validateConfig(config).config;
  }

  function render() {
    $('setup').hidden = setUp && !replacing;
    $('limits').hidden = !setUp;
    $('authenticator').hidden = !setUp;
    if (!setUp) {
      $('head-status').textContent = 'Not set up yet';
      return;
    }
    $('head-status').textContent = saved.paused ? 'Paused' : `${saved.sites.length} site${saved.sites.length === 1 ? '' : 's'} limited`;
    renderSites();
    $('cap').value = draft.overallCapMin ?? '';
    $('paused').checked = draft.paused;
    updateDirty();
  }

  $('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const domain = TG.normalizeDomain($('add-domain').value);
    const minutes = Number($('add-minutes').value);
    if (!domain) return showMessages($('limit-messages'), ['Enter a website like youtube.com.'], 'error');
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      return showMessages($('limit-messages'), ['Enter the daily minutes, from 1 to 1440.'], 'error');
    }
    if (draft.sites.some((s) => s.domain === domain)) {
      return showMessages($('limit-messages'), [`${domain} is already in the list.`], 'error');
    }
    draft.sites.push({ domain, limitMin: minutes });
    $('add-domain').value = '';
    $('add-minutes').value = '';
    showMessages($('limit-messages'), ['Added. Save to apply.'], 'warning');
    render();
  });

  $('cap').addEventListener('input', () => {
    draft.overallCapMin = $('cap').value === '' ? null : Number($('cap').value);
    updateDirty();
  });
  $('paused').addEventListener('change', () => {
    draft.paused = $('paused').checked;
    updateDirty();
  });
  $('discard').addEventListener('click', () => {
    draft = clone(saved);
    $('gate').hidden = true;
    showMessages($('limit-messages'), [], '');
    render();
  });

  $('save').addEventListener('click', async () => {
    const code = $('gate').hidden ? undefined : $('gate-code').value;
    const r = await send('saveConfig', { config: draft, code });
    $('gate-code').value = '';
    if (r.errors) return showMessages($('limit-messages'), r.errors, 'error');
    if (r.needCode) {
      $('gate').hidden = false;
      $('gate-reasons').replaceChildren(...r.needCode.map((t) => el('li', { textContent: t })));
      showMessages($('limit-messages'), r.error ? [r.error] : [], 'error');
      $('gate-code').focus();
      return;
    }
    if (r.error) return showMessages($('limit-messages'), [r.error], 'error');
    $('gate').hidden = true;
    await load();
    showMessages($('limit-messages'), ['Saved.'], 'success');
  });

  async function load() {
    const status = await send('status');
    setUp = status.setUp;
    saved = status.config;
    draft = clone(saved);
    render();
  }

  // Keep in sync if settings change elsewhere (another settings tab).
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.config || changes.totp) && same(saved, draft)) load();
  });

  load().then(() => {
    if (!setUp) beginSetup();
  });
})();
