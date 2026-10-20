(function (root) {
  const SG = (root.SpoilerGuard = root.SpoilerGuard || {});

  // "Avengers: Doomsday!", "AVENGERS—DOOMSDAY" and "Avéngers doomsday" all become
  // "avengers doomsday". Apostrophes become spaces so "Thor's" -> "thor s" still
  // contains the token "thor".
  function normalize(text) {
    if (text == null) return '';
    return String(text)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // Text is padded with spaces so keyword checks can require whole-token
  // boundaries with a plain includes(): " doomsday " never matches "doomsdayprepper".
  function prepareText(text) {
    const n = normalize(text);
    return n ? ' ' + n + ' ' : '';
  }

  function compileKeyword(keyword) {
    const n = normalize(keyword);
    if (!n) return null;
    return {
      spaced: ' ' + n + ' ',
      // Multi-word keywords also match their squashed hashtag form, as a token
      // prefix: "avengers doomsday" matches #AvengersDoomsday and
      // #AvengersDoomsdaySpoilers. Single words don't get this, to avoid
      // "thor" matching "thorough".
      squashedPrefix: n.includes(' ') ? ' ' + n.replace(/ /g, '') : null,
    };
  }

  function keywordMatches(compiled, preparedText) {
    if (!preparedText) return false;
    if (preparedText.includes(compiled.spaced)) return true;
    return compiled.squashedPrefix !== null && preparedText.includes(compiled.squashedPrefix);
  }

  Object.assign(SG, { normalize, prepareText, compileKeyword, keywordMatches });
  if (typeof module !== 'undefined') module.exports = SG;
})(globalThis);
