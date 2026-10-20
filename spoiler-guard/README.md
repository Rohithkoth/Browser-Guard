# Spoiler Guard

A personal Chrome extension that covers YouTube videos and Instagram posts matching your spoiler rules. Everything runs locally: no server, no accounts, no network requests, no cost.

## How it works

1. You create rules in the settings page, for example "Avengers: Doomsday" with keywords like `Avengers Doomsday` and `Doctor Doom`.
2. On YouTube and Instagram, the extension watches the page for video cards and posts, including ones that load as you scroll.
3. It reads each card's text (title, caption, hashtags, accessibility labels, image descriptions) and checks it against your active rules.
4. A matching card gets an opaque cover that says which rule blocked it (never which keyword matched), plus the channel and upload time to help you decide. **Show title** puts the title on the cover; **Show video** then removes the cover.
5. When you turn a rule off, or it reaches its end date, covered cards in open tabs are restored right away. A rule with a start date leaves content visible until then (handy for allowing trailers before release) and starts covering on its own when the time comes.

## Components

| File | What it does |
|---|---|
| `manifest.json` | Tells Chrome what the extension is: which sites it runs on (YouTube, Instagram), which files to inject, and which permission it needs (`storage` only). |
| `src/shared/normalize.js` | Cleans text so formatting doesn't matter: lowercases it, strips accents and punctuation, collapses spaces. Also defines how one keyword matches against text. |
| `src/shared/rules.js` | The rule logic: whether a rule is active (on, past its start date, before its end date), which rules match a piece of text, when the next rule starts or ends, and form validation. |
| `src/shared/storage.js` | Reads and writes your settings in `chrome.storage.local`, on your machine, and notifies the other parts when settings change. |
| `src/shared/overlay.js` | Puts the cover on a matched card and takes it off again. Shows the blocking rule, channel and upload time. Runs the two-step reveal (title, then video). Blocks clicks and hovers so a covered video can't be opened or start a preview. |
| `src/shared/details.js` | Small helpers platform files use to pull a card's title, channel and upload time. |
| `src/shared/rulefile.js` | Reads and writes the plain-text rule file format used for import/export, and merges imported rules into yours. |
| `src/shared/scanner.js` | The engine. Finds cards on the page, watches for new or changed ones, runs each through the rules, and tells the overlay what to cover. |
| `src/platforms/youtube.js` | YouTube-specific: the element names YouTube uses for video cards, and where each card keeps its title, channel and upload time. |
| `src/platforms/instagram.js` | Instagram-specific: how to recognize feed posts and grid tiles, and where a post keeps its caption, author and time. |
| `src/content/main.js` | The startup script injected into each YouTube/Instagram tab. Picks the right platform, loads your rules, starts the scanner, and re-applies rules when they change, start or end. |
| `src/content/content.css` | Hides everything inside a covered card and positions the cover. |
| `src/content/prehide-youtube.css`, `prehide-instagram.css` | Keep cards invisible until they've been checked (prevents a spoiler flash on load). Split per site so each site only evaluates its own selectors. |
| `src/options/` | The settings page: add, edit, turn on/off, and delete rules; optional start and end dates; import/export rule files; global on/off switch. |
| `examples/` | Ready-to-import rule files: `avengers-doomsday.txt` and `test-rules.txt` (for running the test checklist). |
| `src/popup/` | The small window from the toolbar icon: on/off switch, active and upcoming rules, link to settings. |
| `test/` | Automated tests. `matching.test.js`: matching and scheduling logic. `rulefile.test.js`: the rule file format. `scanner.test.js`: loads the real content-script files into a simulated page (jsdom) and checks covers, details and reveals. `options.test.js`: the real settings page importing and exporting with an in-memory storage. |

### Design choices worth knowing

- **One definition of "active".** `isRuleActive()` is the only place that decides whether a rule applies. Not-started-yet, ended, and manually turned off all behave identically.
- **Start and end dates.** Both are optional. Blocking begins exactly at the start time and stops exactly at the end time. Open tabs set a timer for the next start or end, so covers appear or disappear without a refresh.
- **Whole-word matching.** Keyword `thor` matches "Thor returns" and "Thor's hammer", but not "thorough".
- **Hashtags.** Multi-word keywords also match their joined-up hashtag form: `Avengers Doomsday` matches `#AvengersDoomsday` and `#AvengersDoomsdaySpoilers`. Single words don't get this, to avoid false positives.
- **Keywords are never shown on the page.** The overlay shows only rule names. The settings list shows only how many keywords a rule has; the keywords appear only when you open the rule to edit it.
- **No flash on load.** While at least one rule is active, cards stay invisible until they've been checked. If something breaks, they're un-hidden after 4 seconds so the site never goes blank.
- **Checked before paint, once per frame.** Page changes are collected by a `MutationObserver` and each affected card is checked at most once per animation frame, just before the browser paints. Background tabs don't run animation frames, so they do no work. A reused card that switches to a different video is checked immediately instead, so a new spoiler thumbnail can't show for even one frame.
- **No needless re-scans.** Re-applying identical rules is a no-op, and switching to a tab only re-applies rules if a start or end time passed while it was hidden. The cover being added or removed doesn't trigger a re-check of its own card.
- **Two-step reveal.** **Show title** needs a second click within 3 seconds ("Click again to show title"), so a stray click can't spoil anything. The title then appears on the cover while the thumbnail stays hidden. **Show video** removes the cover. Cards where no title can be found get a single **Show anyway** step instead. A revealed item stays revealed for that video or post ID, even through small in-place updates like view counts. The reveal is forgotten when the card element is reused for different content or the page reloads.
- **Details on the cover.** Channel and upload time are read from the card and shown as plain text. Any part that itself contains a blocked keyword (for example, a channel named after the movie) is left off. Upload times are recognized in YouTube's English wording, long or short ("3 days ago", "3d ago", "2mo ago", "1y ago").
- **Text extraction.** Card text is read node by node and joined with spaces, so text in neighbouring elements doesn't run together. (`textContent` would turn "12:34" + "Doctor Doom" into "12:34Doctor Doom" and miss the keyword.)
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
7. **Start and end dates.** Edit the rule: set **Start blocking** two minutes from now. Results become visible, then get covered on their own at that time. Then set **Stop blocking** two minutes ahead; covers disappear on their own when it passes.
8. **Reveal.** Each cover shows the channel and upload time. Click **Show title**: it changes to "Click again to show title" and reverts after 3 seconds if you don't click again. Click twice: the title appears on the cover, thumbnail still hidden. Click **Show video**: only that item is revealed; other covers stay. Reload the page and it's covered again.
9. **Global switch.** Use the popup's on/off switch. Everything should restore, then re-cover when you switch it back on.
10. **Persistence.** Restart Chrome; the rule should still be there.
11. **Instagram.** Make a rule for a hashtag you follow or that appears in your feed. Check the home feed, a hashtag page, and a profile grid.

12. **Import/export.** Settings → **Share rules** → **Import from file…** and pick `examples/test-rules.txt`. Two rules are added. **Export all rules** downloads a `.txt` you can send to someone else.

For a fuller checklist covering every page type, overlay behaviour and schedules, see `TEST_CASES.md`.

## Rule files

Rules can be shared as plain `.txt` files:

```
# Lines starting with # are comments.
[Avengers: Doomsday]
start: 2026-12-18 19:00
end: 2027-03-01
Avengers Doomsday
Doctor Doom
```

- `[Name]` starts a rule. Each line under it is one keyword.
- `start:` and `end:` are optional. Use YYYY-MM-DD, or YYYY-MM-DD HH:MM in 24-hour time. Times are local time on whoever imports the file.
- `enabled: no` imports the rule switched off.

Importing replaces rules with the same name (ignoring capitals and punctuation) and adds the rest. If the file has any mistake, nothing is imported, and the settings page lists the problems with line numbers.

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

## Performance benchmark

`node bench/workload.js` simulates a YouTube-like page (200 cards, a playing video, hovering, tab switches, a reused card) and prints how many times card text was read, the expensive step. Set `SCANNER=<path>` to compare another version of `scanner.js`.

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
