# Browser Guards

Two small, personal Chrome extensions that make YouTube and Instagram less distracting and spoiler-free:

| Project | What it does |
|---|---|
| [**Spoiler Guard**](spoiler-guard/) | Covers YouTube videos and Instagram posts that match your spoiler rules (for example "Avengers: Doomsday"). Each cover shows which rule blocked it, plus the channel and upload time, so you can decide whether to look. |
| [**Distraction Guard**](distraction-guard/) | Hides YouTube Shorts everywhere and sends Instagram Explore straight to your messages. Works alongside your AdBlock filter list ([`adblock-filters.txt`](adblock-filters.txt)), which hides Instagram's Explore and Reels entry points. |

The two are fully independent. Each loads as its own extension, and you can install, update or turn off either one without touching the other.

### Principles

- **$0 to run.** No paid APIs, subscriptions, hosting or AI services.
- **Local only.** No backend, no accounts, no analytics. Spoiler Guard stores rules in `chrome.storage.local` on your machine. Distraction Guard stores nothing.
- **No network requests.** Neither extension sends anything anywhere.
- **Minimal permissions.** Spoiler Guard asks only for `storage`. Distraction Guard asks for none.
- **Plain files, no build step.** Edit a file, reload the extension, done.
- **Stays within YouTube's rules.** Ads are never blocked on YouTube, so creators still get paid. These extensions only hide parts of the interface.

## Repository layout

```
browser-guards/
├── README.md               ← you are here
├── adblock-filters.txt     AdBlock custom filters (Instagram Explore/Reels, YouTube allowlist)
├── spoiler-guard/
│   ├── manifest.json
│   ├── src/
│   │   ├── shared/         rule logic, matching, storage, overlay, page scanner, rule files
│   │   ├── platforms/      youtube.js, instagram.js: site-specific card detection
│   │   ├── content/        startup script and CSS injected into YouTube/Instagram
│   │   ├── options/        settings page (rules, dates, import/export)
│   │   └── popup/          toolbar popup (on/off switch, active rules)
│   ├── examples/           ready-to-import rule files
│   ├── test/               automated tests (Node + jsdom)
│   ├── bench/              performance benchmark
│   ├── README.md           architecture, install, debugging, limitations
│   └── TEST_CASES.md       manual test checklist for the real sites
└── distraction-guard/
    ├── manifest.json
    ├── hide-shorts.css           hides YouTube Shorts shelves, tiles, sidebar button, channel tab
    ├── instagram-redirects.js    /explore/ → /direct/inbox/
    ├── test/
    └── README.md
```

## Quick start

You need Chrome and, for running the tests, Node 18 or newer.

### 1. Install both extensions

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the `spoiler-guard` folder.
3. Click **Load unpacked** again and select the `distraction-guard` folder.
4. On each extension's card, click **Details** and turn on **Allow in Incognito** if you want them there too. Then close every Incognito window and open a new one, because windows already open don't pick up the change.
5. Optional: pin Spoiler Guard via the puzzle-piece icon in Chrome's toolbar. Its popup has the on/off switch.

### 2. Add the AdBlock filters

In AdBlock: **Options → Customize → Edit** (custom filters). Replace the contents with [`adblock-filters.txt`](adblock-filters.txt) and save.

### 3. Add your first spoiler rule

Click the Spoiler Guard icon → **Manage rules**, then either:
- create a rule: a name, one keyword per line, and optional start/end dates; or
- **Import from file…** and pick `spoiler-guard/examples/avengers-doomsday.txt`.

### 4. Check it works

- **YouTube:** no Shorts on the home page, search or sidebar. Searching for a blocked topic shows dark covers reading "Blocked: <rule> · <channel> · 3d ago". Ads still play.
- **Instagram:** no Explore or Reels in the navigation. Typing `instagram.com/explore/` lands you in your messages.

For a full checklist, see [`spoiler-guard/TEST_CASES.md`](spoiler-guard/TEST_CASES.md).

## How the pieces fit together

| Need | Handled by | Why there |
|---|---|---|
| Hide Instagram Explore/Reels links and the Explore grid | AdBlock filters | Simple CSS hiding is what filter lists are good at. |
| Stop Instagram Explore opened by URL | Distraction Guard | Filters can't redirect a page; a few lines of script can. |
| Hide YouTube Shorts | Distraction Guard | AdBlock is switched off on YouTube (so ads play), which disables its hiding rules there too. |
| Hide spoilers | Spoiler Guard | Needs rules, dates, matching and covers, so it's its own extension. |

## Everyday use

| Task | Where |
|---|---|
| Pause all spoiler blocking | Spoiler Guard popup → switch off |
| Block a show only once it's out | Rule → **Start blocking** = release date and time |
| Unblock after you've watched it | Rule → **Turn off**, or set **Stop blocking** in advance |
| Peek at one blocked video | **Show title** (click twice), then **Show video** |
| Share rules with a friend | Settings → **Export all rules**; they use **Import from file…** |
| Block Reels by URL too | Add `'/reels/'` to `BLOCKED_PATHS` in `distraction-guard/instagram-redirects.js` |

## Development

### Making changes

1. Edit the files.
2. In `chrome://extensions`, click the reload icon on that extension's card.
3. Open a **new** tab. Tabs that were already open keep the old version until refreshed.

### Running the tests

```bash
# Spoiler Guard: matching, scheduling, rule files, page scanning, settings page
cd spoiler-guard
npm install        # installs jsdom, a dev-only dependency
npm test

# Distraction Guard: which Instagram paths redirect
cd distraction-guard
node --test
```

Spoiler Guard also has a performance benchmark: `node bench/workload.js`.

### When YouTube or Instagram change their layout

Both sites rename page elements from time to time. Symptoms and where to fix them:

| Symptom | File to update |
|---|---|
| Shorts reappear somewhere | `distraction-guard/hide-shorts.css` |
| Instagram Explore/Reels links reappear | `adblock-filters.txt` (then re-paste into AdBlock) |
| A spoiler isn't covered, or a card stays blank | `spoiler-guard/src/platforms/youtube.js` or `instagram.js` (card list), and the matching `src/content/prehide-*.css` |
| Cover is missing the channel or upload time | `spoiler-guard/src/platforms/youtube.js` (detail selectors) |

To find the right element name: right-click the item → **Inspect**, then look for the outermost tag of that card. The Debugging section of [`spoiler-guard/README.md`](spoiler-guard/README.md) walks through it.

## Known limitations

- **Markup-dependent.** Detection relies on the sites' current page structure. When a site changes, a selector needs updating, as described above.
- **Literal matching.** Spoiler Guard matches keywords, not meaning. A video titled "I CAN'T BELIEVE THAT ENDING" won't be caught unless it mentions a keyword.
- **Instagram is weaker than YouTube.** Grid tiles often expose only an image description, and the Reels viewer isn't covered.
- **English YouTube interface.** Upload times on covers are recognized in English only.
- **Watch page.** If you open a spoiler video directly, its player and title aren't covered. Recommendations beside it are.

See each project's README for the full list.

## Roadmap

From the original project brief, explored only after the keyword MVP:

1. **Better keyword matching:** fewer false positives and false negatives (plurals, variants, per-rule exclusions).
2. **Local semantic matching:** a small model running on your machine to catch related content without exact keywords. Optional, free, no data leaves the computer.
3. **Thumbnail analysis:** local image models to recognize characters or scenes in thumbnails. Feasibility study first.
