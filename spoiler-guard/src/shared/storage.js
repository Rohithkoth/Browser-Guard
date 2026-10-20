(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  // "enabled" and "rules" are separate keys so the popup's on/off switch and the
  // options page's rule edits can't overwrite each other.
  const DEFAULTS = { enabled: true, rules: [] };

  async function loadSettings() {
    const stored = await chrome.storage.local.get(DEFAULTS);
    return {
      enabled: stored.enabled !== false,
      rules: Array.isArray(stored.rules) ? stored.rules : [],
    };
  }

  function saveRules(rules) {
    return chrome.storage.local.set({ rules });
  }

  function setEnabled(enabled) {
    return chrome.storage.local.set({ enabled: Boolean(enabled) });
  }

  function onSettingsChanged(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.rules || changes.enabled)) callback();
    });
  }

  Object.assign(SG, { loadSettings, saveRules, setEnabled, onSettingsChanged });
})(globalThis);
