(function () {
  const TG = globalThis.TimeGuard;
  const { send, showMessages } = TG;
  const $ = (id) => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const site = TG.normalizeDomain(params.get('site'));
  // Only ever send you back to the limited site itself.
  const from = (() => {
    const url = params.get('from');
    return url && TG.siteForUrl(url, [{ domain: site }]) ? url : `https://${site}/`;
  })();
  let choice = '1m';
  const CHOICE_TEXT = { '1m': '1 more minute', '15m': '15 more minutes', '30m': '30 more minutes' };

  async function render() {
    const s = await send('status');
    const usage = s.usage;
    const config = s.config;
    if (!config.sites.some((x) => x.domain === site) || !TG.isBlocked(site, config, usage)) {
      // Unblocked meanwhile (midnight, pause, a higher limit, another tab's unlock).
      location.replace(from);
      return;
    }
    const reason = TG.blockReason(site, config, usage);
    const used = TG.formatMinutes(usage.perSite[site] || 0);
    if (reason === 'total') {
      $('headline').textContent = 'Daily total reached';
      $('usage').textContent = `You've used ${TG.formatMinutes(usage.totalMs)} across your limited sites today (total ${config.overallCapMin} min). ${site}: ${used}.`;
    } else {
      $('headline').textContent = `Time's up on ${site}`;
      const limit = config.sites.find((x) => x.domain === site).limitMin;
      $('usage').textContent = `You've used ${used} of your ${limit} min today.`;
    }
    $('reset').textContent = `Limits reset at midnight, in ${TG.untilText(s.nextReset - s.now)}.`;
    document.title = `Time's up on ${site} · Time Guard`;
  }

  for (const button of document.querySelectorAll('.choices button')) {
    button.addEventListener('click', () => { choice = button.value; });
  }

  $('unlock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter) choice = e.submitter.value;
    const r = await send('unlock', { site, code: $('code').value, choice });
    $('code').value = '';
    if (r.error) {
      showMessages($('messages'), [r.error], 'error');
      $('code').focus();
      return;
    }
    $('unlock').hidden = true;
    $('done').hidden = false;
    $('done-text').textContent = `You have ${CHOICE_TEXT[choice]} on ${site}.`;
    $('continue').href = from;
    $('continue').textContent = `Continue to ${site}`;
    $('continue').focus();
  });

  $('close').addEventListener('click', () => window.close());

  // Re-check when anything changes, and every minute for the reset countdown.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.config || changes.usage) && $('done').hidden) render();
  });
  setInterval(() => { if ($('done').hidden) render(); }, 60 * 1000);

  if (!site) {
    $('headline').textContent = 'Time Guard';
    $('unlock').hidden = true;
  } else {
    render();
    $('code').focus();
  }
})();
