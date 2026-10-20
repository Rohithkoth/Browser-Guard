(function () {
  // Pages that bounce straight to your messages. Matched exactly, so
  // /explore/tags/<tag>/ and /explore/locations/... still work.
  // To also block Reels, add '/reels/'.
  const BLOCKED_PATHS = ['/explore/'];
  const DESTINATION = '/direct/inbox/';

  function shouldRedirect(pathname) {
    const path = pathname.endsWith('/') ? pathname : pathname + '/';
    return BLOCKED_PATHS.includes(path.toLowerCase());
  }

  if (typeof module !== 'undefined') {
    module.exports = { shouldRedirect };
    return;
  }

  function check() {
    // replace() rather than assign(), so Back doesn't land on Explore again.
    if (shouldRedirect(location.pathname)) location.replace(DESTINATION);
  }

  // Typing the URL, a bookmark, or a refresh: runs before Instagram's own scripts.
  check();

  // Clicking a link inside Instagram changes the URL without loading a new
  // page, and content scripts can't hook the site's history calls, so watch
  // for path changes instead. Checking a string 4x a second costs nothing.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      check();
    }
  }, 250);
  window.addEventListener('popstate', check);
})();
