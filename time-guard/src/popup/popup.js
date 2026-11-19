(function () {
  const TG = globalThis.TimeGuard;
  const { el, send } = TG;
  const $ = (id) => document.getElementById(id);

  function bar(fraction, over) {
    return el('div', { className: 'bar' + (over ? ' over' : '') }, [
      el('span', { style: `width:${Math.min(100, Math.round(fraction * 100))}%` }),
    ]);
  }

  function siteRow(domain, config, usage) {
    const used = usage.perSite[domain] || 0;
    const limit = TG.siteLimitMs(domain, config);
    const blocked = TG.isBlocked(domain, config, usage);
    const underLimits = TG.remainingUnderLimits(domain, config, usage);
    let left;
    let kind = '';
    if (config.paused) left = 'paused';
    else if (usage.unlimited[domain]) { left = 'unlocked for today'; kind = 'bonus'; }
    else if (blocked) { left = 'time\'s up'; kind = 'out'; }
    else if (underLimits <= 0) { left = `${TG.formatMinutes(usage.bonusMs[domain] || 0)} extra left`; kind = 'bonus'; }
    else left = `${TG.formatMinutes(underLimits)} left`;
    return el('div', {}, [
      el('div', { className: 'site-line' }, [
        el('strong', { textContent: domain }),
        el('span', { className: 'left ' + kind, textContent: left }),
      ]),
      bar(used / limit, used >= limit),
      el('small', { textContent: `${TG.formatMinutes(used)} of ${TG.formatMinutes(limit)}` }),
    ]);
  }

  async function render() {
    const s = await send('status');
    const { config, usage } = s;
    $('reset').textContent = `resets in ${TG.untilText(s.nextReset - s.now)}`;
    const banner = !s.setUp ? 'Not set up yet. Open Settings to finish setup.' : config.paused ? 'Paused: nothing is counted or blocked.' : '';
    $('banner').textContent = banner;
    $('banner').hidden = !banner;

    const rows = config.sites.map((site) => siteRow(site.domain, config, usage));
    if (config.overallCapMin != null) {
      const cap = config.overallCapMin * TG.MINUTE;
      rows.push(el('div', {}, [
        el('div', { className: 'site-line' }, [
          el('strong', { textContent: 'Daily total' }),
          el('span', { className: 'left', textContent: `${TG.formatMinutes(Math.max(0, cap - usage.totalMs))} left` }),
        ]),
        bar(usage.totalMs / cap, usage.totalMs >= cap),
        el('small', { textContent: `${TG.formatMinutes(usage.totalMs)} of ${TG.formatMinutes(cap)}` }),
      ]));
    }
    if (s.setUp && !rows.length) rows.push(el('p', { className: 'muted', textContent: 'No sites limited yet.' }));
    $('sites').replaceChildren(...rows);
  }

  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.usage || changes.config)) render();
  });
  render();
})();
