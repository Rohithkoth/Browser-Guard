(function () {
  const SG = globalThis.SpoilerGuard;
  const $ = (id) => document.getElementById(id);

  const form = $('rule-form');
  const nameInput = $('rule-name');
  const keywordsInput = $('rule-keywords');
  const startsInput = $('rule-starts');
  const expiresInput = $('rule-expires');
  const messages = $('form-messages');
  const list = $('rule-list');

  let rules = [];
  let editingId = null;

  // datetime-local works in local time with no timezone, so convert by hand.
  function toLocalInput(ms) {
    if (ms == null) return '';
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromLocalInput(value) {
    return value ? new Date(value).getTime() : null;
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const child of children || []) node.append(child);
    return node;
  }

  function showMessages(errors, warnings) {
    messages.replaceChildren(
      ...errors.map((t) => el('span', { className: 'error', textContent: t })),
      ...warnings.map((t) => el('span', { className: 'warning', textContent: t })),
    );
  }

  function resetForm() {
    editingId = null;
    form.reset();
    $('form-title').textContent = 'New rule';
    $('save-rule').textContent = 'Add rule';
    $('cancel-edit').hidden = true;
  }

  function startEdit(rule) {
    editingId = rule.id;
    nameInput.value = rule.name;
    keywordsInput.value = rule.keywords.join('\n');
    startsInput.value = toLocalInput(rule.startsAt);
    expiresInput.value = toLocalInput(rule.expiresAt);
    $('form-title').textContent = 'Edit rule';
    $('save-rule').textContent = 'Save changes';
    $('cancel-edit').hidden = false;
    showMessages([], []);
    nameInput.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function persist(next) {
    rules = next;
    await SG.saveRules(rules);
    render();
  }

  function statusLabel(rule, now) {
    const status = SG.ruleStatus(rule, now);
    const fmt = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    if (status === 'disabled') return 'Off';
    if (status === 'expired') return 'Ended ' + fmt(rule.expiresAt);
    if (status === 'scheduled') {
      return 'Starts ' + fmt(rule.startsAt) + (rule.expiresAt != null ? ', ends ' + fmt(rule.expiresAt) : '');
    }
    if (rule.expiresAt != null) return 'Active until ' + fmt(rule.expiresAt);
    return 'Active';
  }

  function render() {
    const now = Date.now();
    $('empty-state').hidden = rules.length > 0;
    // Keywords aren't listed here, since they can be spoilers themselves.
    // They're only shown when you open a rule to edit it.
    list.replaceChildren(
      ...rules.map((rule) => {
        const status = SG.ruleStatus(rule, now);
        const toggle = el('button', {
          className: 'ghost',
          textContent: rule.enabled ? 'Turn off' : 'Turn on',
          onclick: () => persist(rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))),
        });
        const edit = el('button', { className: 'ghost', textContent: 'Edit', onclick: () => startEdit(rule) });
        const del = el('button', {
          className: 'ghost danger',
          textContent: 'Delete',
          onclick: () => {
            if (!confirm(`Delete the rule "${rule.name}"?`)) return;
            if (editingId === rule.id) resetForm();
            persist(rules.filter((r) => r.id !== rule.id));
          },
        });
        const count = rule.keywords.length;
        return el('li', { className: 'rule ' + status }, [
          el('div', { className: 'rule-main' }, [
            el('strong', { textContent: rule.name }),
            el('span', { className: 'meta', textContent: `${statusLabel(rule, now)} · ${count} keyword${count === 1 ? '' : 's'}` }),
          ]),
          el('div', { className: 'row' }, [toggle, edit, del]),
        ]);
      }),
    );
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const now = Date.now();
    const { errors, warnings, value } = SG.validateRuleInput(
      {
        name: nameInput.value,
        keywords: keywordsInput.value.split('\n'),
        startsAt: fromLocalInput(startsInput.value),
        expiresAt: fromLocalInput(expiresInput.value),
      },
      now,
    );
    showMessages(errors, warnings);
    if (errors.length) return;

    if (editingId) {
      await persist(rules.map((r) => (r.id === editingId ? { ...r, ...value } : r)));
    } else {
      await persist([...rules, { id: SG.newRuleId(), enabled: true, createdAt: now, ...value }]);
    }
    resetForm();
    // Warnings stay visible after saving so you can still act on them.
    showMessages([], warnings);
  });

  $('cancel-edit').addEventListener('click', () => {
    resetForm();
    showMessages([], []);
  });
  $('clear-starts').addEventListener('click', () => (startsInput.value = ''));
  $('clear-expires').addEventListener('click', () => (expiresInput.value = ''));
  $('global-enabled').addEventListener('change', (e) => SG.setEnabled(e.target.checked));

  // Keep in sync with changes made from the popup or another settings tab.
  SG.onSettingsChanged(async () => {
    const settings = await SG.loadSettings();
    rules = settings.rules;
    $('global-enabled').checked = settings.enabled;
    render();
  });

  // Re-render each minute so statuses flip (Starts → Active → Ended) without a reload.
  setInterval(render, 60 * 1000);

  SG.loadSettings().then((settings) => {
    rules = settings.rules;
    $('global-enabled').checked = settings.enabled;
    render();
  });
})();
