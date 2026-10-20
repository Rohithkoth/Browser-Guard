(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  // Plain-text rule files, easy to write by hand and share:
  //
  //   # Lines starting with # are comments.
  //   [Avengers: Doomsday]
  //   start: 2026-12-18 19:00      (optional; date, or date and 24-hour time)
  //   end: 2027-03-01              (optional)
  //   Avengers Doomsday
  //   Doctor Doom
  //
  // [Name] starts a rule; every other line under it is a keyword. Dates are in
  // the reader's local time, so a shared "start: 2026-12-18 19:00" means 7 PM
  // wherever the file is imported.

  const HEADER = /^\[(.+)\]$/;
  const SETTING = /^(start|end|enabled)\s*:\s*(.*)$/i;
  const DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/;

  function parseDate(value) {
    const m = DATE.exec(value.trim());
    if (!m) return NaN;
    const [, y, mo, d, h = '0', mi = '0'] = m;
    const date = new Date(+y, +mo - 1, +d, +h, +mi);
    // new Date rolls invalid dates over (Feb 30 -> Mar 2); reject those instead.
    if (date.getFullYear() !== +y || date.getMonth() !== +mo - 1 || date.getDate() !== +d || +h > 23) return NaN;
    return date.getTime();
  }

  function formatDate(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return d.getHours() || d.getMinutes() ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
  }

  // Returns { rules, errors, warnings }. rules hold { name, keywords, startsAt,
  // expiresAt, enabled } ready to merge; nothing is imported if errors is non-empty.
  function parseRuleFile(text, now) {
    const rules = [];
    const errors = [];
    const warnings = [];
    let current = null;

    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.trim();
      const where = `Line ${i + 1}`;
      if (!line || line.startsWith('#')) return;

      const header = HEADER.exec(line);
      if (header) {
        current = { name: header[1].trim(), keywords: [], startsAt: null, expiresAt: null, enabled: true, line: i + 1 };
        rules.push(current);
        return;
      }
      if (!current) {
        errors.push(`${where}: "${line}" comes before any [Rule name] line.`);
        return;
      }
      const setting = SETTING.exec(line);
      if (setting) {
        const key = setting[1].toLowerCase();
        const value = setting[2].trim();
        if (key === 'enabled') {
          current.enabled = !/^(no|false|off)$/i.test(value);
        } else {
          const ms = parseDate(value);
          if (Number.isNaN(ms)) errors.push(`${where}: "${value}" isn't a date. Use YYYY-MM-DD or YYYY-MM-DD HH:MM.`);
          else current[key === 'start' ? 'startsAt' : 'expiresAt'] = ms;
        }
        return;
      }
      current.keywords.push(line);
    });

    const valid = [];
    for (const rule of rules) {
      const check = SG.validateRuleInput(rule, now);
      for (const e of check.errors) errors.push(`[${rule.name}] (line ${rule.line}): ${e}`);
      for (const w of check.warnings) warnings.push(`[${rule.name}]: ${w}`);
      if (!check.errors.length) valid.push({ ...check.value, enabled: rule.enabled });
    }
    if (!rules.length && !errors.length) errors.push('No rules found. Each rule starts with a [Rule name] line.');
    return { rules: errors.length ? [] : valid, errors, warnings };
  }

  function formatRuleFile(rules) {
    const out = [
      '# Spoiler Guard rules',
      '# Each rule starts with [Name]. Lines below it are keywords, one per line.',
      '# Optional: "start: YYYY-MM-DD HH:MM", "end: YYYY-MM-DD HH:MM", "enabled: no".',
    ];
    for (const rule of rules) {
      out.push('', `[${rule.name}]`);
      if (rule.startsAt != null) out.push(`start: ${formatDate(rule.startsAt)}`);
      if (rule.expiresAt != null) out.push(`end: ${formatDate(rule.expiresAt)}`);
      if (!rule.enabled) out.push('enabled: no');
      out.push(...rule.keywords);
    }
    return out.join('\n') + '\n';
  }

  // Imported rules replace same-named rules (matched ignoring case and
  // punctuation) and are added otherwise. Returns { rules, added, updated }.
  function mergeImported(existing, imported, now) {
    const byName = new Map(existing.map((r) => [SG.normalize(r.name), r]));
    const result = existing.slice();
    let added = 0;
    let updated = 0;
    for (const rule of imported) {
      const match = byName.get(SG.normalize(rule.name));
      if (match) {
        const merged = { ...match, ...rule, id: match.id, createdAt: match.createdAt };
        result[result.indexOf(match)] = merged;
        byName.set(SG.normalize(rule.name), merged);
        updated++;
      } else {
        const fresh = { id: SG.newRuleId(), createdAt: now, ...rule };
        result.push(fresh);
        byName.set(SG.normalize(rule.name), fresh);
        added++;
      }
    }
    return { rules: result, added, updated };
  }

  Object.assign(SG, { parseRuleFile, formatRuleFile, mergeImported });
  if (typeof module !== 'undefined') module.exports = SG;
})(globalThis);
