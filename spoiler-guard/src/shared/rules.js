(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  const SHORT_KEYWORD_LENGTH = 4;

  // Rule shape stored in chrome.storage.local:
  // { id, name, keywords: string[], enabled: boolean,
  //   startsAt: number|null, expiresAt: number|null, createdAt: number }
  // startsAt and expiresAt are optional. A rule blocks from startsAt (inclusive)
  // until expiresAt (exclusive); a missing bound means "no limit on that side".

  // The single definition of "active". Start dates, expiry and manual disabling
  // all go through here, so every way a rule stops blocking behaves the same.
  function isRuleActive(rule, now) {
    if (!rule || !rule.enabled) return false;
    if (rule.startsAt != null && now < rule.startsAt) return false;
    if (rule.expiresAt != null && now >= rule.expiresAt) return false;
    return Array.isArray(rule.keywords) && rule.keywords.length > 0;
  }

  function ruleStatus(rule, now) {
    if (!rule.enabled) return 'disabled';
    if (rule.expiresAt != null && now >= rule.expiresAt) return 'expired';
    if (rule.startsAt != null && now < rule.startsAt) return 'scheduled';
    return 'active';
  }

  function compileRules(rules, now) {
    const compiled = [];
    for (const rule of rules || []) {
      if (!isRuleActive(rule, now)) continue;
      const matchers = rule.keywords.map(SG.compileKeyword).filter(Boolean);
      if (matchers.length) compiled.push({ id: rule.id, name: rule.name, matchers });
    }
    return compiled;
  }

  // Returns the rules (id + name only) that match. Callers never get the keyword
  // that matched, so it can't leak into the overlay.
  function matchText(text, compiledRules) {
    const prepared = SG.prepareText(text);
    if (!prepared) return [];
    const hits = [];
    for (const rule of compiledRules) {
      if (rule.matchers.some((m) => SG.keywordMatches(m, prepared))) {
        hits.push({ id: rule.id, name: rule.name });
      }
    }
    return hits;
  }

  // Next moment an enabled rule starts or expires, so open tabs can
  // re-evaluate right then.
  function nextChange(rules, now) {
    let next = null;
    for (const rule of rules || []) {
      if (!rule.enabled) continue;
      for (const at of [rule.startsAt, rule.expiresAt]) {
        if (at != null && at > now && (next === null || at < next)) next = at;
      }
    }
    return next;
  }

  function cleanKeywords(keywords) {
    const seen = new Set();
    const result = [];
    for (const raw of keywords || []) {
      const keyword = String(raw).trim();
      const key = SG.normalize(keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(keyword);
    }
    return result;
  }

  // Validates form input. Returns { errors, warnings, value } where value holds
  // cleaned fields ready to merge into a rule.
  function validateRuleInput(input, now) {
    const errors = [];
    const warnings = [];
    const name = String(input.name || '').trim();
    const keywords = cleanKeywords(input.keywords);
    const toTime = (v) => (v == null || v === '' ? null : Number(v));
    const startsAt = toTime(input.startsAt);
    const expiresAt = toTime(input.expiresAt);

    if (!name) errors.push('Give the rule a name.');
    if (!keywords.length) errors.push('Add at least one keyword.');
    if (startsAt !== null && !Number.isFinite(startsAt)) errors.push('Start date is not valid.');
    if (expiresAt !== null && !Number.isFinite(expiresAt)) errors.push('End date is not valid.');
    if (Number.isFinite(startsAt) && Number.isFinite(expiresAt) && startsAt >= expiresAt) {
      errors.push('The end date must be after the start date.');
    }
    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      warnings.push('The end date is in the past, so this rule will not block anything.');
    }
    const short = keywords.filter((k) => {
      const n = SG.normalize(k);
      return !n.includes(' ') && n.length < SHORT_KEYWORD_LENGTH;
    });
    if (short.length) {
      warnings.push(`Very short keywords can block unrelated posts: ${short.join(', ')}`);
    }
    return { errors, warnings, value: { name, keywords, startsAt, expiresAt } };
  }

  function newRuleId() {
    return root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  Object.assign(SG, {
    isRuleActive,
    ruleStatus,
    compileRules,
    matchText,
    nextChange,
    cleanKeywords,
    validateRuleInput,
    newRuleId,
  });
  if (typeof module !== 'undefined') module.exports = SG;
})(globalThis);
