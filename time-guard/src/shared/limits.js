(function (root) {
  const TG = (root.TimeGuard = root.TimeGuard || {});

  // Pure limit logic: no Chrome APIs, so it can be unit-tested directly.
  //
  // config (chrome.storage.local "config"):
  //   { sites: [{ domain: 'youtube.com', limitMin: 60 }], overallCapMin: 90 | null, paused: false }
  // usage (chrome.storage.local "usage"), reset every day at local midnight:
  //   { day: '2026-11-18', perSite: { 'youtube.com': ms }, totalMs,
  //     bonusMs: { 'youtube.com': ms },   // extra time bought with a code
  //     unlimited: { 'youtube.com': true } }  // "rest of the day" bought with a code

  const MINUTE = 60 * 1000;
  const MAX_LIMIT_MIN = 24 * 60;
  const GRANTS = { '15m': 15 * MINUTE, '1h': 60 * MINUTE, day: Infinity };

  // "https://www.YouTube.com/watch?v=1" -> "youtube.com". Returns '' if it
  // doesn't look like a domain.
  function normalizeDomain(input) {
    let s = String(input || '').trim().toLowerCase();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(s) ? s : '';
  }

  // The tracked site a hostname belongs to: youtube.com covers m.youtube.com
  // too. The most specific match wins.
  function siteForHost(host, sites) {
    const h = String(host || '').toLowerCase().replace(/\.$/, '');
    let best = null;
    for (const site of sites || []) {
      if ((h === site.domain || h.endsWith('.' + site.domain)) && (!best || site.domain.length > best.length)) {
        best = site.domain;
      }
    }
    return best;
  }

  function siteForUrl(url, sites) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return siteForHost(u.hostname, sites);
    } catch {
      return null;
    }
  }

  function dayKey(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function nextReset(ms) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }

  function freshUsage(now) {
    return { day: dayKey(now), perSite: {}, totalMs: 0, bonusMs: {}, unlimited: {} };
  }

  // Today's usage; a record from an earlier day starts over.
  function currentUsage(usage, now) {
    return usage && usage.day === dayKey(now) ? usage : freshUsage(now);
  }

  function siteLimitMs(domain, config) {
    const site = (config.sites || []).find((s) => s.domain === domain);
    return site ? site.limitMin * MINUTE : Infinity;
  }

  // Time left before the site's own limit or the overall cap, whichever is
  // first. Ignores bonus time.
  function remainingUnderLimits(domain, config, usage) {
    const site = siteLimitMs(domain, config) - (usage.perSite[domain] || 0);
    const total = config.overallCapMin != null ? config.overallCapMin * MINUTE - usage.totalMs : Infinity;
    return Math.max(0, Math.min(site, total));
  }

  function blockReason(domain, config, usage) {
    if ((usage.perSite[domain] || 0) >= siteLimitMs(domain, config)) return 'site';
    if (config.overallCapMin != null && usage.totalMs >= config.overallCapMin * MINUTE) return 'total';
    return null;
  }

  function isBlocked(domain, config, usage) {
    if (!domain || config.paused) return false;
    if (remainingUnderLimits(domain, config, usage) > 0) return false;
    if (usage.unlimited[domain]) return false;
    return (usage.bonusMs[domain] || 0) <= 0;
  }

  // Total time a site can still be used today, counting bonus time.
  function timeLeft(domain, config, usage) {
    if (config.paused || usage.unlimited[domain]) return Infinity;
    return remainingUnderLimits(domain, config, usage) + (usage.bonusMs[domain] || 0);
  }

  // Adds ms of use to each active site. Wall-clock time counts once toward the
  // overall total even if two tracked sites were in use at the same time (say,
  // YouTube playing in the background while you scroll Instagram). Any time
  // past a site's limits is paid for out of its bonus time.
  function applyElapsed(usage, config, activeDomains, ms) {
    if (!activeDomains.length || ms <= 0) return usage;
    const next = {
      ...usage,
      perSite: { ...usage.perSite },
      bonusMs: { ...usage.bonusMs },
      totalMs: usage.totalMs + ms,
    };
    for (const domain of activeDomains) {
      const allowance = remainingUnderLimits(domain, config, usage);
      const overflow = Math.max(0, ms - allowance);
      if (overflow > 0 && !usage.unlimited[domain] && next.bonusMs[domain]) {
        next.bonusMs[domain] = Math.max(0, next.bonusMs[domain] - overflow);
      }
      next.perSite[domain] = (next.perSite[domain] || 0) + ms;
    }
    return next;
  }

  // ms until the first active site runs out of time (Infinity if never today).
  function msUntilNextBlock(activeDomains, config, usage) {
    let soonest = Infinity;
    for (const domain of activeDomains) soonest = Math.min(soonest, timeLeft(domain, config, usage));
    return soonest;
  }

  function applyGrant(usage, domain, choice) {
    if (!(choice in GRANTS)) throw new Error('Unknown unlock choice: ' + choice);
    if (choice === 'day') return { ...usage, unlimited: { ...usage.unlimited, [domain]: true } };
    return { ...usage, bonusMs: { ...usage.bonusMs, [domain]: (usage.bonusMs[domain] || 0) + GRANTS[choice] } };
  }

  // Lists every way newConfig is looser than oldConfig. An empty list means the
  // change only tightens things (or changes nothing), so no code is needed.
  function looseningChanges(oldConfig, newConfig) {
    const reasons = [];
    if (!oldConfig.paused && newConfig.paused) reasons.push('pausing Time Guard');
    const newSites = new Map((newConfig.sites || []).map((s) => [s.domain, s]));
    for (const site of oldConfig.sites || []) {
      const updated = newSites.get(site.domain);
      if (!updated) reasons.push(`removing ${site.domain}`);
      else if (updated.limitMin > site.limitMin) reasons.push(`raising ${site.domain} from ${site.limitMin} to ${updated.limitMin} min`);
    }
    if (oldConfig.overallCapMin != null) {
      if (newConfig.overallCapMin == null) reasons.push('removing the daily total cap');
      else if (newConfig.overallCapMin > oldConfig.overallCapMin) {
        reasons.push(`raising the daily total from ${oldConfig.overallCapMin} to ${newConfig.overallCapMin} min`);
      }
    }
    return reasons;
  }

  function validLimit(n) {
    return Number.isInteger(n) && n >= 1 && n <= MAX_LIMIT_MIN;
  }

  // Returns { errors, config } with domains normalized and duplicates merged.
  function validateConfig(input) {
    const errors = [];
    const sites = [];
    const seen = new Set();
    for (const raw of input.sites || []) {
      const domain = normalizeDomain(raw.domain);
      const limitMin = Number(raw.limitMin);
      if (!domain) {
        errors.push(`"${raw.domain}" isn't a website address. Use something like youtube.com.`);
        continue;
      }
      if (!validLimit(limitMin)) errors.push(`The limit for ${domain} must be a whole number of minutes from 1 to ${MAX_LIMIT_MIN}.`);
      if (seen.has(domain)) {
        errors.push(`${domain} is listed twice.`);
        continue;
      }
      seen.add(domain);
      sites.push({ domain, limitMin });
    }
    let overallCapMin = null;
    if (input.overallCapMin != null && input.overallCapMin !== '') {
      overallCapMin = Number(input.overallCapMin);
      if (!validLimit(overallCapMin)) errors.push(`The daily total must be a whole number of minutes from 1 to ${MAX_LIMIT_MIN}.`);
    }
    return { errors, config: { sites, overallCapMin, paused: Boolean(input.paused) } };
  }

  function formatMinutes(ms) {
    if (ms === Infinity) return 'unlimited';
    const min = Math.floor(ms / MINUTE);
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  }

  Object.assign(TG, {
    MINUTE,
    GRANTS,
    normalizeDomain,
    siteForHost,
    siteForUrl,
    dayKey,
    nextReset,
    freshUsage,
    currentUsage,
    siteLimitMs,
    remainingUnderLimits,
    blockReason,
    isBlocked,
    timeLeft,
    applyElapsed,
    msUntilNextBlock,
    applyGrant,
    looseningChanges,
    validateConfig,
    formatMinutes,
  });
  if (typeof module !== 'undefined') module.exports = TG;
})(globalThis);
