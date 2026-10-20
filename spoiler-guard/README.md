# Spoiler Guard

A personal Chrome extension that covers YouTube videos and Instagram posts matching your spoiler rules. Everything runs locally: no server, no accounts, no network requests, no cost.

## How it works

1. You create rules in the settings page, for example "Avengers: Doomsday" with keywords like `Avengers Doomsday` and `Doctor Doom`.
2. On YouTube and Instagram, the extension watches the page for video cards and posts, including ones that load as you scroll.
3. It reads each card's text (title, caption, hashtags, accessibility labels, image descriptions) and checks it against your active rules.
4. A matching card gets an opaque cover that says which rule blocked it, never which keyword matched.
5. When you turn a rule off, or it expires, covered cards in open tabs are restored right away.

## Components

| File | What it does |
|---|---|
| `manifest.json` | Tells Chrome what the extension is: which sites it runs on (YouTube, Instagram), which files to inject, and which permission it needs (`storage` only). |
| `src/shared/normalize.js` | Cleans text so formatting doesn't matter: lowercases it, strips accents and punctuation, collapses spaces. Also defines how one keyword matches against text. |
| `src/shared/rules.js` | The rule logic: whether a rule is active (on and not expired), which rules match a piece of text, when the next rule expires, and form validation. |
| `src/shared/storage.js` | Reads and writes your settings in `chrome.storage.local`, on your machine, and notifies the other parts when settings change. |
| `src/shared/overlay.js` | Puts the cover on a matched card and takes it off again. Also blocks clicks and hovers so a covered video can't be opened or start a preview. |
| `src/shared/scanner.js` | The engine. Finds cards on the page, watches for new or changed ones, runs each through the rules, and tells the overlay what to cover. |
| `src/platforms/youtube.js` | YouTube-specific: the list of element names YouTube uses for video cards. |
| `src/platforms/instagram.js` | Instagram-specific: how to recognize feed posts and grid tiles. |
| `src/content/main.js` | The startup script injected into each YouTube/Instagram tab. Picks the right platform, loads your rules, starts the scanner, and re-applies rules when they change or expire. |
| `src/content/content.css` | Hides cards until they've been checked (prevents a spoiler flash on load) and hides everything inside a covered card. |
| `src/options/` | The settings page: add, edit, turn on/off, and delete rules; set expirations; global on/off switch. |
| `src/popup/` | The small window from the toolbar icon: on/off switch, list of active rules, link to settings. |
| `test/` | Automated tests. `matching.test.js` covers the matching and expiry logic. `scanner.test.js` loads the real content-script files into a simulated page (jsdom) and checks what gets covered. |

### Design choices worth knowing

- **One definition of "active".** `isRuleActive()` is the only place that decides whether a rule applies. An expired rule therefore behaves exactly like a manually disabled one.
- **Whole-word matching.** Keyword `thor` matches "Thor returns" and "Thor's hammer", but not "thorough".
- **Hashtags.** Multi-word keywords also match their joined-up hashtag form: `Avengers Doomsday` matches `#AvengersDoomsday` and `#AvengersDoomsdaySpoilers`. Single words don't get this, to avoid false positives.
- **Keywords are never shown on the page.** The overlay shows only rule names. The settings list shows only how many keywords a rule has; the keywords appear only when you open the rule to edit it.
- **No flash on load.** While at least one rule is active, cards stay invisible until they've been checked. If something breaks, they're un-hidden after 4 seconds so the site never goes blank.
- **Checked before paint.** New and changed cards are checked from a `MutationObserver`, whose callbacks run before the browser paints, so they're covered before they appear.
- **Idle when unused.** With no active rules, the scanner stops watching the page entirely.
- **Reused cards.** YouTube reuses card elements for different videos, so a card is re-checked whenever its text changes, not just when it's first added.
- **Safe insertion.** Page text and rule names are only ever inserted as plain text, never as HTML. The overlay lives in a closed shadow root so site styles can't affect it.
- **No build step.** The scripts are plain files listed in order in the manifest, sharing one `SpoilerGuard` namespace. Tests run the same files.

## Install

1. Unzip the folder somewhere permanent, for example `Documents\spoiler-guard`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `spoiler-guard` folder (the one containing `manifest.json`).
4. Optional: click **Details** and turn on **Allow in Incognito**.
5. Pin it: click the puzzle-piece icon in Chrome's toolbar, then the pin next to Spoiler Guard.

## Test it on the real sites

1. **Create a rule.** Click the toolbar icon → **Manage rules**. Use something you can easily find on YouTube right now. For example, name it `Test` with the keyword `minecraft`.
2. **Concealment.** Open youtube.com in a new tab and search for `minecraft`. Every Minecraft result should be a dark box saying "Blocked: Test", with no thumbnail visible.
3. **Unrelated content.** Search for something unrelated, like `pasta recipe`. Nothing should be covered.
4. **Dynamic content.** On the Minecraft search, scroll down several pages. New results should arrive already covered.
5. **Navigation without reload.** Click into an unrelated video, then check the recommendations sidebar.
6. **Turning a rule off.** With the Minecraft search open, turn the rule off in settings. The covers should disappear without a refresh. Turn it back on and they return.
7. **Expiry.** Edit the rule and set it to expire two minutes from now. When it passes, covers disappear on their own.
8. **Global switch.** Use the popup's on/off switch. Everything should restore, then re-cover when you switch it back on.
9. **Persistence.** Restart Chrome; the rule should still be there.
10. **Instagram.** Make a rule for a hashtag you follow or that appears in your feed. Check the home feed, a hashtag page, and a profile grid.

## Debugging

- **Extension errors:** `chrome://extensions` → Spoiler Guard card → **Errors**.
- **Content-script logs:** on YouTube/Instagram, open DevTools (F12) → Console. Spoiler Guard messages start with `[Spoiler Guard]`.
- **Settings page or popup:** right-click inside it → **Inspect**.
- **Something visible should be covered:** right-click it → **Inspect**, then find the outermost element of that card.
  - **No `data-sg-checked` attribute:** the card's element name isn't in `src/platforms/youtube.js` (or `instagram.js`). Add it to `CARD_SELECTORS`, and add it to the pre-hide list in `content.css`.
  - **Has `data-sg-checked` but not covered:** the text didn't match. In the Console, run `$0.textContent` with the card selected in Elements to see the text the extension reads.
- **Inspect stored rules:** on the settings page, open DevTools and run `chrome.storage.local.get(console.log)`.

## Updating after code changes

Edit the files, then click the reload icon on the extension card in `chrome://extensions`. Open a new YouTube/Instagram tab. Tabs that were already open keep the old version until refreshed.

## Running the automated tests

Requires Node 18+.

```
npm install
npm test
```

## Known limitations

- **Site markup changes.** Card detection depends on YouTube's element names and Instagram's page structure. When either site changes, update the list in that platform's file.
- **Instagram grids.** Explore and profile tiles often expose only an auto-generated image description, not the caption, so detection there is weaker than in the home feed.
- **Instagram Reels viewer** (`/reels/`) is not covered yet.
- **YouTube watch page.** The main video's player, title and description aren't covered if you open a spoiler video directly. The sidebar recommendations are covered.
- **Matching is literal.** `Avenger` doesn't match `Avengers`; add the variants you care about. Content that never mentions a keyword (for example, a reaction video titled "I CAN'T BELIEVE THAT ENDING") won't be caught; that's what the Phase 2 semantic matching would explore.
- **Late-arriving titles.** If a site renders a thumbnail first and its title in a later step, the thumbnail can show for a moment before the title arrives.
- **Not yet tested in real Chrome.** The automated tests run the real code against simulated YouTube and Instagram markup. The first real-browser check is the procedure above.
