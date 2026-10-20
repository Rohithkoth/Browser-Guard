(function () {
  const SG = globalThis.SpoilerGuard;
  const ARMED_CLASS = 'sg-armed';
  // If something goes wrong before the first scan finishes, stop pre-hiding
  // after this long rather than leaving the page blank.
  const FAIL_OPEN_MS = 4000;
  // setTimeout can't wait longer than ~24.8 days; later dates just re-check.
  const MAX_TIMER_MS = 2 ** 31 - 1;

  const adapter = Object.values(SG.platforms).find((p) => p.matchesHost(location.hostname));
  if (!adapter) return;

  const html = document.documentElement;
  // Armed immediately, before settings load, so nothing renders unchecked while
  // chrome.storage is still answering. Disarmed below if no rule is active.
  html.classList.add(ARMED_CLASS);
  const failOpen = setTimeout(() => html.classList.remove(ARMED_CLASS), FAIL_OPEN_MS);

  const scanner = SG.createScanner(adapter, document);
  let changeTimer = null;
  let nextChangeAt = null;

  async function refresh() {
    try {
      const { enabled, rules } = await SG.loadSettings();
      const now = Date.now();
      const compiled = enabled ? SG.compileRules(rules, now) : [];
      scanner.setRules(compiled);
      html.classList.toggle(ARMED_CLASS, compiled.length > 0);
      scheduleNextChange(enabled ? SG.nextChange(rules, now) : null, now);
    } catch (err) {
      console.error('[Spoiler Guard] could not apply rules', err);
      html.classList.remove(ARMED_CLASS);
    } finally {
      clearTimeout(failOpen);
    }
  }

  // Re-applies rules the moment one starts or expires.
  function scheduleNextChange(at, now) {
    clearTimeout(changeTimer);
    changeTimer = null;
    nextChangeAt = at;
    if (at === null) return;
    changeTimer = setTimeout(refresh, Math.min(at - now + 50, MAX_TIMER_MS));
  }

  SG.onSettingsChanged(refresh);
  // Background tabs can have their timers delayed. When the tab is shown again,
  // catch up only if a start or end time has passed while it was hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && nextChangeAt !== null && Date.now() >= nextChangeAt) {
      refresh();
    }
  });
  refresh();
})();
