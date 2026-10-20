(function () {
  const SG = globalThis.SpoilerGuard;
  const enabledBox = document.getElementById('enabled');
  const list = document.getElementById('active-rules');

  async function render() {
    const { enabled, rules } = await SG.loadSettings();
    const now = Date.now();
    const active = rules.filter((r) => SG.isRuleActive(r, now));
    enabledBox.checked = enabled;
    document.getElementById('active-heading').textContent = enabled
      ? `Active rules (${active.length})`
      : 'Paused: nothing is being hidden';
    const items = enabled ? active.map((r) => r.name) : [];
    if (enabled && !items.length) items.push('None. Add a rule to start hiding spoilers.');
    list.replaceChildren(...items.map((text) => Object.assign(document.createElement('li'), { textContent: text })));
  }

  enabledBox.addEventListener('change', () => SG.setEnabled(enabledBox.checked));
  document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  SG.onSettingsChanged(render);
  render();
})();
