(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  const SHORT_KEYWORD_LENGTH = 4;

  // Rule shape stored in chrome.storage.local:
  // { id, name, keywords: string[], enabled: boolean, expiresAt: number|null, createdAt: number }

  // The single definition of "active". Expiry and manual disabling both go through
  // here, so an expired rule behaves exactly like a disabled one everywhere.
  function isRuleActive(rule, now) {
    if (!rule || !rule.enabled) return false;
    if (rule.expiresAt != null && now >= rule.expiresAt) return false;
    return Array.isArray(rule.keywords) && rule.keywords.length > 0;
  }

  function ruleStatus(rule, now) {
    if (!rule.enabled) return 'disabled';
    if (rule.expiresAt != null && now >= rule.expiresAt) return 'expired';
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

  // Next moment an enabled rule expires, so open tabs can re-evaluate right then.
  function nextExpiry(rules, now) {
    let next = null;
    for (const rule of rules || []) {
      if (rule.enabled && rule.expiresAt != null && rule.expiresAt > now) {
        if (next === null || rule.expiresAt < next) next = rule.expiresAt;
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
    const expiresAt = input.expiresAt == null || input.expiresAt === '' ? null : Number(input.expiresAt);

    if (!name) errors.push('Give the rule a name.');
    if (!keywords.length) errors.push('Add at least one keyword.');
    if (expiresAt !== null && !Number.isFinite(expiresAt)) errors.push('Expiration date is not valid.');
    if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= now) {
      warnings.push('The expiration is in the past, so this rule will not block anything.');
    }
    const short = keywords.filter((k) => {
      const n = SG.normalize(k);
      return !n.includes(' ') && n.length < SHORT_KEYWORD_LENGTH;
    });
    if (short.length) {
      warnings.push(`Very short keywords can block unrelated posts: ${short.join(', ')}`);
    }
    return { errors, warnings, value: { name, keywords, expiresAt } };
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
    nextExpiry,
    cleanKeywords,
    validateRuleInput,
    newRuleId,
  });
  if (typeof module !== 'undefined') module.exports = SG;
})(globalThis);
