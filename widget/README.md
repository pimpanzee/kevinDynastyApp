# Home Screen widget

An iPhone Home Screen (and Lock Screen) widget with your live matchup and the
latest touchdowns and big plays by players in it. It runs in
[Scriptable](https://apps.apple.com/app/scriptable/id1405459188), a free app
that runs JavaScript widgets, because a web app can't add widgets to iOS.

| Size | Shows |
|---|---|
| Small | both scores, win odds, the latest key play |
| Medium | scores with projections, win odds, the last 4 key plays |
| Large | the same, bigger, with the last 8 key plays |
| Lock Screen, rectangular | score line, win odds, the latest key play |
| Lock Screen, round | win odds (W/L and your score once final) |
| Lock Screen, inline (above the clock) | `🏈 135.3–80.4 · 68%` |

**Key plays** are touchdowns, plus runs and catches of 20+ yards and passes of
40+ yards, by starters in your matchup. A red marker is your player and a grey
one is your opponent's. Tapping the widget opens the matchup in the app.

## Setup

1. Install **Scriptable** from the App Store.
2. On your phone, open <https://pimpanzee.github.io/kevinDynastyApp/widget/>
   and tap **Copy script**. In Scriptable, tap **+**, paste, and name it
   `The Liam`. Tap ▶ to preview it. (The page carries
   [`gridlock-widget.js`](gridlock-widget.js), read at build time.)
3. On the Home Screen, long-press → **Edit Home Screen** → **+** →
   **Scriptable**, then pick a size and add it.
4. Long-press the new widget → **Edit Widget** → **Script: The Liam**.
5. Optional, for another team: set **Parameter** to a franchise id (`0005`)
   or part of a team name (`Tuna`). Blank shows the league's default team.

For the Lock Screen: long-press the Lock Screen → **Customize** → **Lock
Screen**, tap the widget row under the clock (or the line above it) →
**Scriptable**, pick a shape, then tap the added widget and choose **Script:
The Liam**. Lock Screen widgets are drawn in one tint by iOS.

## How fresh it is

iOS decides when widgets refresh. The script asks for every 5 minutes during
games, 30 before kickoff and 2 hours once the week is final, and iOS usually
refreshes every 5–15 minutes on game day. Opening Scriptable or tapping ▶
refreshes it straight away.

The data comes from the live relay's `/widget` endpoint (`worker/`). It reads
MFL's live scores (shared with the app, at most every 90 seconds) and ESPN's
play-by-play for games in progress (at most every 2 minutes). The site build
publishes `/widget.json` with the week's matchups, rosters and projections,
which the relay uses to match plays to players. If the relay can't be reached,
the widget shows the last scores it had, marked "offline".
