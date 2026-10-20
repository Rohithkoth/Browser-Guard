# Distraction Guard

Personal Chrome extension. No permissions, no network requests, no data stored.

| File | What it does |
|---|---|
| `manifest.json` | Tells Chrome to inject `hide-shorts.css` on YouTube and `instagram-redirects.js` on Instagram. |
| `hide-shorts.css` | Hides YouTube Shorts shelves, tiles, the sidebar button and the channel tab. |
| `instagram-redirects.js` | Sends `instagram.com/explore/` to your messages (`/direct/inbox/`), whether you type the URL or click a link to it. Hashtag and location pages under `/explore/` still work. |
| `test/` | Checks which paths get redirected. Run with `node --test`. |

Works alongside AdBlock: keep `@@||youtube.com^$document` and your Instagram rules there.

## Install or update
1. `chrome://extensions` → Developer mode on → **Load unpacked** → select this folder.
2. **Details** → **Allow in Incognito**.
3. After editing a file, click the reload icon on the card and open a new tab.

## Test
- Type `instagram.com/explore/` in the address bar: you should land in your messages.
- Inside Instagram, use any link to Explore (for example, a link someone sends you): same result.
- Press Back: you should not land on Explore again.
- `instagram.com/explore/tags/cats/` should still open normally.
- YouTube: no Shorts on home, search or the sidebar; ads still play.

## Changing what's blocked
Add paths to `BLOCKED_PATHS` in `instagram-redirects.js`, for example `'/reels/'`.

## Limitations
- A link click inside Instagram can show Explore for up to a quarter-second before the redirect. Your AdBlock rule hides the Explore grid, so in practice you see an empty page.
- If Instagram moves Explore to a different URL, update `BLOCKED_PATHS`.
