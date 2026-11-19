# Time Guard

A personal Chrome extension that sets daily time limits on distracting sites. Once you hit a limit, the only way past it is a 6-digit code from an authenticator app on your phone. The code changes every 30 seconds, so there's nothing to memorize; you have to stop, pick up your phone, and look.

Runs entirely on your computer: no server, no account, no cost. Codes are checked locally with the same standard (TOTP, RFC 6238) that Google Authenticator, Microsoft Authenticator and Authy use.

## How it works

1. **Setup.** The settings page shows a QR code. Scan it with your authenticator app, then type the code the app shows to prove it worked. After that the key is never shown again.
2. **Limits.** Add sites with a daily limit in minutes (e.g. youtube.com 60, instagram.com 20), plus an optional daily total across all of them.
3. **Counting.** Time counts while a limited site is the active tab of the focused Chrome window, or while one of its tabs is playing sound (a video on a second screen). Nothing counts while Chrome is in the background, the computer is locked, or it's asleep. Two sites at once count once toward the daily total.
4. **At the limit.** Every tab of that site is sent to a block page. Opening the site again goes straight there too.
5. **Unlocking.** Enter the current code from your phone, then choose **15 more minutes**, **1 more hour** or **Rest of today**. Extra minutes only drain while you're actually using the site. **Continue** takes you back where you were.
6. **Midnight.** Usage, extra time and "rest of today" unlocks all reset at local midnight.

### Settings lock

| Change | Needs a code? |
|---|---|
| Add a site, lower a limit, add or lower the daily total, resume | No |
| Raise a limit, remove a site, raise or remove the daily total, pause | Yes |
| Move to a new authenticator | Yes, from the current one |

## Components

| File | What it does |
|---|---|
| `manifest.json` | Permissions: `storage` (settings and usage), `alarms` (checks every 30 s and at the exact moment a limit runs out), `tabs` (to see which site a tab is on and send it to the block page), `idle` (to pause counting while the computer is locked). |
| `src/background.js` | The service worker and the only code that changes stored data. It counts time, decides what's blocked, redirects tabs, and handles every request that needs a code. Pages ask it through messages, so updates never race. |
| `src/shared/totp.js` | Authenticator codes: key generation, base32, HMAC-SHA1 code calculation, and checking a code with ±30 s of clock drift. Each code works only once. |
| `src/shared/limits.js` | Pure limit logic with no Chrome APIs: matching sites, today's usage, per-site limits and the daily total, extra time, what counts as loosening, input validation. |
| `src/shared/client.js` | Small helpers for the pages: messaging the service worker, building elements safely, drawing the QR code. |
| `src/options/` | Settings: setup with QR code and confirmation, limits editor with the code gate, moving to a new authenticator. |
| `src/blocked/` | The block page: how much you used, when it resets, and the code box with the three unlock choices. |
| `src/popup/` | Toolbar popup: time left per site and for the daily total. |
| `vendor/qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 (MIT), bundled so the extension never loads code from the internet. |
| `test/` | Automated tests, described below. |

### Design choices worth knowing

- **Code checks.** A code is accepted for its own 30-second window and one window on either side, since phone clocks drift. Once a code has been used it can't be reused, even within its window. Five wrong codes in a row lock code entry for 2 minutes, which makes guessing pointless (1 in a million per try).
- **Counting.** Time is credited every 30 seconds and whenever focus or the active tab changes. A gap longer than 90 seconds (the computer slept) is capped, so sleep never counts. Time after midnight counts toward the new day.
- **Exact cut-off.** Besides the 30-second check, an alarm is set for the moment the next active site runs out, so blocks land on time (Chrome can delay alarms by up to 30 s).
- **Incognito.** Chrome doesn't let an extension's own pages load inside an Incognito tab. When an Incognito tab hits a limit, Time Guard closes it and opens the block page in a normal window. **Continue** then goes to the site's home page rather than the Incognito address, so the address doesn't end up in your normal history.
- **Safe redirects.** The block page only ever sends you back to the limited site, never to another address passed in its link.
- **No backdoor.** There are no recovery codes, by design: anything you could write down, you could memorize.

## Install

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `time-guard` folder.
2. The settings page opens. Scan the QR code with your authenticator app and enter the code it shows.
3. Add your sites and limits, then **Save changes**.
4. Optional: **Details** → **Allow in Incognito**. Then close every Incognito window and open a new one, because windows already open don't pick up the change.
5. Optional: pin it via the puzzle-piece icon to see time left at a glance.

## Honest limits: friction, not a vault

Time Guard makes going over your limit deliberate. It can't make it impossible, because you own the computer:

- You can turn the extension off or remove it in `chrome://extensions`, or use another browser.
- The key is stored in the extension's local storage on your machine. Someone determined could read it with developer tools. That takes far more effort than grabbing your phone, which is the point.

Want it stricter? Give the authenticator to someone else (they scan the QR during setup, and you ask them for a code), or use a separate profile without developer mode for your normal browsing.

## Testing

Requires Node 18 or newer.

```bash
npm install   # jsdom, used only by the page tests
npm test
```

- `test/totp.test.js`: code generation against the official RFC 6238 test vectors, clock drift, replays and malformed codes.
- `test/limits.test.js`: site matching, limits, the daily total, extra time, midnight reset, what counts as loosening.
- `test/background.test.js`: runs the real service worker against a simulated Chrome (`test/fake-chrome.js`) with a controllable clock: counting, blocking, unlocking, lockout, Incognito, sleep, the total cap, settings changes.
- `test/pages.test.js`: loads the real settings and block pages against that simulated Chrome and clicks through setup, saving limits, the code gate, and unlocking.

For checks in real Chrome, see `TEST_CASES.md`.

## Debugging

- **Service worker logs:** `chrome://extensions` → Time Guard → **Inspect views: service worker**.
- **Stored data:** in that service worker console, run `chrome.storage.local.get(console.log)`.
- **Errors:** the **Errors** button on the extension's card.
- **After code changes:** click the reload icon on the card. Usage and settings are kept.

## Known limitations

- **Time is counted per site domain** (youtube.com covers m.youtube.com and music.youtube.com). Paths can't be limited separately.
- **Up to 30 s late.** Chrome runs extension alarms at most every 30 seconds, so a block can land up to 30 seconds late.
- **Background audio counts.** Music playing in a background tab of a limited site counts as use.
- **Lost phone:** remove and reload the extension, which clears your limits and today's usage.
