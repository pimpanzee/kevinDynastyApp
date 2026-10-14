# Design backlog

Design decisions settled on the Option A (Hashmark) canvas, waiting for one code pass once
every screen's design is final. Nothing here is built yet unless marked.

Canvas: https://claude.ai/artifact/CDgoN9eCg8NCKutK6Ceowa — boards `A · Matchups` and `A · Matchup detail`.

## Matchups screen

- Remove the LIVE / kickoff / YTP strip.
- Top 6 race: label reads PROJECTED or FINAL (never LIVE). No greying out of teams below the
  cut; keep a subtle bg-100 shading behind the top six.
- Lineup alert card: LINEUP ALERT chip in red (`--live`, light text).

## Matchup detail

### Layout: stacked by roster

- Each team's starters stack independently in their own column: QB → RB → WR → TE,
  highest-scoring first within a position, players yet to play last.
- No blank cells, no position chip in the middle, no heavier rule between position groups —
  every row uses the normal thin line.
- Bench stacks per roster the same way (no middle "BN" label).
- STARTERS header shows each side's starter count, e.g. `10 · 9` (superflex: 7–10 starters).
- Replaces today's sorted-index pairing (`pairRows` in `lib/mfl/view.ts`), which produces
  mixed "QB/RB" rows.

### Player rows

- First subline: `POS · TM · STATUS`. Position in bold in its chip color (`--pos-qb/rb/wr/te`);
  team abbreviation always grey; only a live game clock is colored, in red (`--live`), not blue.
- Second subline: the NFL game line (`W 31-17 vs DAL`, `17-14 @ LAR`, `vs ARI`).
- Stat line, "Standard" SOP, always one line — ellipsis when too long, never wraps:
  - QB: `C/ATT, YD, TD, INT` then `RUSH CAR-YD`
  - RB: `RUSH CAR-YD` then `REC REC-YD`
  - WR/TE: `REC REC-YD` then `RUSH CAR-YD`
  - Each segment carries its own TDs (`RUSH 21-118, TD`); a lone 1 is dropped (`TD`, `INT`).
  - Segments with no attempts are dropped; `FUM` goes last.
  - No stat line before a player's game starts.

### States

- Pre-game: scores are dashes, projections under them, no stat lines.
- Final: every NFL game reads Final with a W/L result; players who hadn't played show final points.
- Lineup alert hidden once the matchup is final; LINEUP chip red (`--live`).

### Navigation

- Header matches Matchups (`THE LIAM … WEEK ▾ [avatar]`) plus a back arrow before the logo.
- Changing the week keeps you on the same matchup slot (your game, for yours).
- Keep the `‹ MATCHUP 1 OF 6 · YOURS ›` pager strip below the header.
- Bottom tab bar stays, MATCHUPS lit; tapping it returns to the Matchups list.

## Open questions

- Game line team codes: short (SF, KC, GB) vs MFL codes (SFO, KCC, GBP).
- Pre-week kickoff time: where it lives on Matchups now that the strip is gone.
- Whether the player card shows the full (untruncated) stat line.
- Matchups screen pre-game / final states haven't been mocked yet.

## Already in code (PR #41)

You always on the left, score header center (odds / FINAL), pre-game dashes, NFL game lines
from the Sleeper scores feed. Some of these get revised by the items above.
