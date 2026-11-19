# Time Guard: manual test cases

Run these in real Chrome after installing or changing the extension. Use short limits (1–2 minutes) so you're not waiting long. Keep your authenticator app open.

Mark each ✅ / ❌.

## A. Setup

| ID | Steps | Expected |
|---|---|---|
| A1 | Load the extension unpacked. | The settings page opens by itself, showing a QR code. Limits are hidden until setup is done. |
| A2 | Scan the QR with your authenticator app. | An entry named "Time Guard (Chrome)" appears, showing a 6-digit code that changes every 30 s. |
| A3 | Enter `000000` and click **Finish setup**. | "That code doesn't match…"; setup not finished. |
| A4 | Close the settings page, reopen it (puzzle icon → Time Guard → Options). | Same QR and key as before; the entry already on your phone still works. |
| A5 | Enter the current code and click **Finish setup**. | The setup box disappears for good and the limits editor appears. |
| A6 | Try **Can't scan? Enter the key instead** on a second device (optional). | Typing the key manually gives the same codes. |

## B. Limits and the settings lock

| ID | Steps | Expected |
|---|---|---|
| B1 | Add `youtube.com` with 2 min, `instagram.com` with 1 min. **Save changes**. | "Saved." No code asked. |
| B2 | Paste `https://www.reddit.com/r/all` as a site with 5 min. | Saved as `reddit.com`. |
| B3 | Lower youtube.com to 1 min, save. | Saved, no code. |
| B4 | Raise youtube.com to 5 min, save. | The yellow box lists "raising youtube.com from 1 to 5 min" and asks for a code. Without one, nothing is saved. |
| B5 | Enter a wrong code, save. | "That code isn't right…"; still not saved. |
| B6 | Enter the current code, save. | "Saved." The box disappears. |
| B7 | Remove reddit.com, save. | Asks for a code. |
| B8 | Tick **Pause**, save. | Asks for a code. Untick and save: no code. |
| B9 | Set a daily total of 3 min, save. | No code. Removing it later asks for one. |

## C. Counting

| ID | Steps | Expected |
|---|---|---|
| C1 | Open YouTube, watch for 1 minute, open the popup. | youtube.com shows about 1 min used. |
| C2 | Switch to another tab (not a limited site) for 1 minute. | YouTube's time doesn't go up. |
| C3 | Play a YouTube video, switch to a different tab while it plays. | Time keeps counting (it's playing sound). Pause the video: counting stops. |
| C4 | Click into another app so Chrome isn't focused, with YouTube silent. | Time doesn't count. |
| C5 | Lock the computer (Win+L) for 2 minutes with YouTube open. | Those 2 minutes don't count. |
| C6 | Open the popup. | Each site shows a bar, "x min left", and when limits reset. |

## D. Blocking

| ID | Steps | Expected |
|---|---|---|
| D1 | Use YouTube until its limit runs out. | Within about 30 s, the tab switches to "Time's up on youtube.com", with minutes used and the reset time. |
| D2 | Open a new tab to youtube.com, and m.youtube.com. | Both go straight to the block page. |
| D3 | Have two YouTube tabs open when the limit hits. | Both switch to the block page. |
| D4 | Hit the daily total (B9) on a different site than YouTube. | All limited sites are blocked with "Daily total reached". |
| D5 | Visit a site you didn't limit. | Works normally. |

## E. Unlocking

| ID | Steps | Expected |
|---|---|---|
| E1 | On the block page, enter a wrong code and click **15 more minutes**. | "That code isn't right." |
| E2 | Enter the current code and click **15 more minutes**. | "You have 15 more minutes on youtube.com." **Continue** returns to the exact page you were on. |
| E3 | Popup after E2. | youtube.com shows "15 min extra left", draining only while you use it. |
| E4 | When the 15 minutes run out. | Blocked again. |
| E5 | Unlock with **Rest of today**. | Popup shows "unlocked for today"; no further blocks until midnight. |
| E6 | Reuse the code you just used (within 30 s) on another blocked site. | Rejected. Wait for the next code. |
| E7 | Enter 5 wrong codes in a row. | "Locked for 2 minutes"; even a correct code is refused until then. |

## F. Midnight

| ID | Steps | Expected |
|---|---|---|
| F1 | Leave a block page open across midnight (or change your computer's clock forward, then back). | After midnight the page returns you to the site by itself; usage starts from zero. |
| F2 | A "Rest of today" unlock from yesterday. | No longer applies. |

## G. Incognito (with "Allow in Incognito" on)

| ID | Steps | Expected |
|---|---|---|
| G1 | Use YouTube in an Incognito window. | Counts toward the same limit. |
| G2 | Hit the limit in Incognito. | The Incognito tab closes and the block page opens in a normal window. Continuing goes to youtube.com's home page, not the Incognito address. |

## H. Moving to a new phone

| ID | Steps | Expected |
|---|---|---|
| H1 | Settings → Authenticator: enter a wrong code. | Refused. |
| H2 | Enter a current code. | A new QR appears. Scan it as a new entry and confirm with its code. |
| H3 | Try a code from the old entry on a block page. | Refused. The new entry's code works. |

## I. Not broken elsewhere

| ID | Steps | Expected |
|---|---|---|
| I1 | `chrome://extensions` → Time Guard → **Errors**. | Empty. |
| I2 | Spoiler Guard and Distraction Guard still work alongside. | They're independent; a blocked site just shows the Time Guard page instead. |
| I3 | Reload the extension (circular arrow). | Settings, today's usage and the authenticator are kept. |
