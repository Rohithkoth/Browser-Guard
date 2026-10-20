# Spoiler Guard: manual test cases

Run these in real Chrome after any change, especially after YouTube or Instagram change their layout. The automated tests (`npm test`) cover the matching logic and a simulated page; these cover the real sites.

**Before you start**
- Reload the extension in `chrome://extensions`, then open fresh tabs, not refreshed old ones.
- Use topics with lots of content right now so results are easy to find. The cases below use **Minecraft** as the "spoiler" and **pasta** as the safe topic.
- Keep DevTools Console open on the site to catch `[Spoiler Guard]` errors.

Mark each case ✅ / ❌ and note anything odd.

---

## A. Rule management (settings page)

| ID | Steps | Expected |
|---|---|---|
| A1 | Create rule `Test MC`, keywords `minecraft`, no dates. | Appears in the list as **Active · 1 keyword**. Keywords are not shown in the list. |
| A2 | Click **Edit** on A1, add keyword `creeper`, save. | List shows **2 keywords**. Reopening Edit shows both. |
| A3 | Try to save a rule with a name but no keywords. | Error: "Add at least one keyword." Nothing saved. |
| A4 | Create a rule with keyword `mc`. | Saves, with a warning that very short keywords can block unrelated posts. |
| A5 | Set Start blocking later than Stop blocking. | Error: "The end date must be after the start date." |
| A6 | Click **Turn off** on A1, then **Turn on**. | Status flips Off ↔ Active. Popup's active list updates to match. |
| A7 | Delete a rule. | Confirmation prompt; rule is gone after confirming. |
| A8 | Restart Chrome completely. | All rules, states and dates are still there. |

## B. Matching (YouTube search)

With rule `Test MC` active (`minecraft`):

| ID | Steps | Expected |
|---|---|---|
| B1 | Search `minecraft`. | Every result with Minecraft in the title is a dark box: "Spoiler Guard / Blocked: Test MC". No thumbnail visible. |
| B2 | Same search: look at the overlay text. | Shows the rule name only, never the word "minecraft". |
| B3 | Search `MINECRAFT 1.21 update`. | Covered regardless of capitals or numbers. |
| B4 | Search `minecraft-style games` or a title with `Minecraft:`. | Covered regardless of punctuation. |
| B5 | Search `pasta recipe`. | Nothing covered. |
| B6 | Add keyword `ender dragon` to the rule. Search `#enderdragon`. | Results using the joined hashtag are covered. |
| B7 | Rule with keyword `thor`. Search `thorough cleaning`. | Not covered (whole-word matching). Delete the rule afterwards. |
| B8 | Create a second rule `Test Pasta` (`pasta`). Find a video with both words (search `minecraft pasta`). | Overlay lists both: "Blocked: Test MC, Test Pasta". Only one box per video. |

## C. Where content appears (YouTube)

| ID | Page | Expected |
|---|---|---|
| C1 | Home feed | Matching cards covered, everything else shows normally (no blank gaps). |
| C2 | A channel page full of Minecraft videos (Videos tab) | All Minecraft videos covered; layout intact. |
| C3 | Watch an unrelated video; check the right sidebar | Matching recommendations covered. |
| C4 | Subscriptions feed | Matching uploads covered. |
| C5 | Search with a Shorts shelf of Minecraft Shorts | Matching Shorts tiles covered (if Distraction Guard isn't already hiding Shorts). |
| C6 | Playlist page with Minecraft videos | Matching rows covered. |

## D. Dynamic content

| ID | Steps | Expected |
|---|---|---|
| D1 | Search `minecraft`, scroll down 5+ pages. | New results arrive already covered; no thumbnail flashes. |
| D2 | From home, click into a video, then the YouTube logo to go back. | Home cards are re-checked; matches covered, no stale covers on unrelated cards. |
| D3 | On the home page, press F5 repeatedly (5×). | No spoiler thumbnails flash before the cover appears. |
| D4 | Open a Minecraft search in a background tab (middle-click), switch to it later. | Already covered when you switch. |

## E. Overlay behaviour

| ID | Steps | Expected |
|---|---|---|
| E1 | Hover over a covered video for 5 seconds. | No hover preview plays, no audio, nothing revealed. |
| E2 | Click on a covered video (not on the button). | Nothing happens; you stay on the page. |
| E3 | Middle-click or Ctrl+click a covered video. | No new tab opens. |
| E4 | Look at a cover. | Shows "Blocked: <rule>", then the channel and upload time (e.g. "Movie Talk · 3 days ago"). No title, no thumbnail. |
| E5 | Click **Show title** once, then wait. | Button changes to "Click again to show title", reverts after ~3 seconds; nothing shown. |
| E6 | Click **Show title** twice quickly. | The title appears on the cover; the thumbnail is still hidden; button now says **Show video**. |
| E7 | Click **Show video**. | Only that video is revealed; others stay covered. Scroll away and back: still revealed. Reload: covered again. |
| E7b | Rule keyword matches a channel name (e.g. keyword = a channel you know). | That channel's covers show only the upload time, not the channel name. |
| E8 | Resize the window narrow, then wide. | Covers stay aligned with their cards; no thumbnail edges peek out. |

## F. Turning blocking off and on

| ID | Steps | Expected |
|---|---|---|
| F1 | With a Minecraft search open, turn `Test MC` off in settings. | Covers disappear in the open tab without refreshing. |
| F2 | Turn it back on. | Covers return without refreshing. |
| F3 | Use the popup's **Spoiler Guard is on** switch. | Off: all covers disappear and the popup says paused. On: they return. |
| F4 | Turn all rules off, then browse YouTube for a minute. | Nothing covered; no console errors. |

## G. Start and end dates

| ID | Steps | Expected |
|---|---|---|
| G1 | Create `Test Schedule` (`minecraft`), Start blocking 2 minutes from now, no end. Keep a Minecraft search open. | List shows "Starts …"; popup shows it under scheduled. Results stay **visible**. |
| G2 | Wait until the start time passes (don't refresh). | Results become covered on their own, within a few seconds. Status shows Active. |
| G3 | Edit the rule: Stop blocking 2 minutes from now. Wait. | Covers disappear on their own when it passes. Status shows "Ended …". |
| G4 | Create a rule whose start date is next week. | Status "Starts <date>"; nothing covered today. |
| G5 | Set G1 up again, but put the tab in the background until after the start time, then switch back. | Covered as soon as you switch back. |
| G6 | Turn a scheduled rule Off. | Status shows Off, not "Starts …". |

## H. Instagram

Pick a hashtag or word that is in your feed today (for example, a show or a team you follow) and make a rule for it.

| ID | Page | Expected |
|---|---|---|
| H1 | Home feed | Posts whose caption contains the word are covered as a whole post; other posts look normal, with their images. |
| H2 | A post whose caption only has the hashtag (`#SomeShow`) and a rule keyword `some show` | Covered (hashtag matching). |
| H3 | A hashtag page (`instagram.com/explore/tags/<tag>/`) | Matching tiles covered. Expect some misses: grids often lack captions. |
| H4 | A profile grid | Tiles covered only when the image description includes the keyword. Note how many get missed. |
| H5 | Open a covered post's link directly (paste its URL) | The post dialog/page is covered. |
| H6 | Scroll the feed for a while | New posts are covered as they load. |

## J. Import and export

| ID | Steps | Expected |
|---|---|---|
| J1 | Settings → Share rules → **Import from file…** → `examples/test-rules.txt`. | Confirmation lists "Test MC" and "Test Pasta". After OK: "2 added, 0 updated"; both rules appear and work on YouTube. |
| J2 | Import the same file again. | "0 added, 2 updated"; no duplicates. |
| J3 | **Export all rules**, open the downloaded file in Notepad. | Readable: `[Name]` lines, keywords, `start:`/`end:` lines where set. |
| J4 | Edit the exported file in Notepad: change a keyword, save, import it. | Rule updated with the new keyword. |
| J5 | Make a file whose first line is a keyword with no `[Name]` above it, import it. | "Nothing was imported", with the line number of the problem. No rules changed. |
| J6 | Import `examples/avengers-doomsday.txt`. | Adds the Avengers: Doomsday rule. |

## I. Not broken elsewhere

| ID | Steps | Expected |
|---|---|---|
| I1 | With rules active, use YouTube normally for 10 minutes. | Playback, comments, menus, and the search box all work. |
| I2 | Open Chrome's Task Manager (Shift+Esc) on a busy YouTube page. | The YouTube tab's CPU is not noticeably higher than with Spoiler Guard off. |
| I3 | Repeat B1 in an Incognito window (with "Allow in Incognito" on). | Same results; rules are shared. |
| I4 | Check `chrome://extensions` → Spoiler Guard → **Errors**. | No errors. |

---

## When a case fails

- **Something should be covered but isn't:** right-click it → Inspect, find the outermost card element, and check the Debugging section of the README.
- **Something is blank instead of covered:** a card element was never marked as checked. Note the element name and which page it was on.
- **Covered but shouldn't be:** select the card in DevTools and run `$0.textContent` in the Console. The matching word is somewhere in that text, possibly the channel name or a hidden label.
