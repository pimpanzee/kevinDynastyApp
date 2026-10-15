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

### Score breakdown sheet

Canvas board `A · Score breakdown sheet`. Tapping a player's points on the matchup page opens a bottom sheet.
- Header: position chip, name, `TEAM · status · game line` (live status in red). No owner/slot line.
- FANTASY POINTS total, `proj X` and `+/−X VS PROJ`.
- One row per stat the player actually recorded: label, rule (`0.1 per yd`), raw stat, points
  (negatives in `--fall`), then TOTAL. A LIVE note while the game is on; no BEST indicator.
- No by-quarter chart, no PLAYER CARD / DONE buttons — close with the X, the scrim or a drag down.
- League scoring (from MFL):
  - Passing: 4 per TD, 0.04 per yd, −3 per INT, −0.1 per sack yard, 2 per 2-pt.
  - Rushing: 6 per TD, 0.1 per yd, 2 per 2-pt. Receiving: 6 per TD, 0.1 per yd, **0.5 per catch**, 2 per 2-pt.
  - No kickers in this league, so kicking rules are ignored.
  - Returns: 6 per punt or kickoff return TD, 0.1 per punt return yard. Fumbles lost: −3.
  - Read the rules from MFL's league `rules` export rather than hard-coding them, if `lib/scoring.ts` doesn't already.

## My Team

Canvas boards: `A · My Team › Roster`, `A · My Team › Cap`.

### Team header (all three tabs)

- One line under the team name, replacing `7-3 · 2nd in Division 1`: `7-3 · 14 VP · 118.6 AVG PF · 1,302.6 PP`
  (division rank and player count dropped; value in ink, label in grey). VP, average PF and potential points (season total of best possible
  lineups) are already computed per team in `lib/mfl/standings.ts` (`vp`, `avgPf`, `pp`).

- The header is identical on Roster, Cap and Picks: team name + that one line, then the tab bar.
  Cap and Picks drop their CAP ROOM / 2026 COMMITTED / 2026 PICKS block; no summary block on
  those tabs for now. The ROOM / ROSTER / IR / TAXI strip stays on the Roster tab only.

### Cap tab — committed by year

- Each year's bar is stacked: contracts already signed (`--ink-2`) + rookie salaries of the picks you
  hold in that year's draft at their projected slots (`--pos-pick`, the pick purple). A small legend
  above the rows: CONTRACTS · DRAFT PICKS.
- Amount column: contracts total, with `+$191.00 picks` under it in purple. ROOM = cap − contracts − picks.
- Pick salaries come from the Picks tab calculation (same projected slots and rookie scale).
- Rookie contracts are treated as **2 years** (options to extend are ignored here). Draft year: the
  pick's rookie salary is in DRAFT PICKS. Second year: that salary × 1.10 moves into CONTRACTS.
- Future years' contract amounts include the +10%/yr appreciation (see League contract rules).

### Picks tab

- Row: round chip (`R1`) · who it belongs to (`Own pick`, `via Second Wind`, `Traded to Iron Lung FC`) —
  no "1st round" title. Right side: projected slot (`PROJ 1.10`) over its rookie salary (`$92.00`).
- Traded-away picks stay listed, dimmed, with no slot or salary.
- Every year shows a projected slot, not just the current one: the original owner's projected finish
  from the current standings (the same projection for 2027 and 2028 until those seasons start).
- Year header right side: picks held · total rookie salary (`4 PICKS · $191.00`).
- Rookie salary scale (league base value by slot), slots 1–12:
  - R1: 125, 122, 119, 116, 112, 108, 104, 100, 96, 92, 88, 84
  - R2: 72, 69, 66, 63, 60, 57, 53, 49, 45, 41, 37, 33
  - R3: 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6
  - R4: 5 for every slot
  Keep it as a constant in one place (e.g. `lib/rookieScale.ts`); check whether MFL exposes it before hard-coding.
- Slots are written `2.10`, not `2.1`.

### Roster table

- Columns: PLAYER · POS RNK · **PPG** · YTD PTS · SALARY · **VALUE** · YRS · STATUS.
- PPG = YTD points ÷ games played (`—` with no games). Not a season total, so missed games don't count against him.
- No position header rows (QUARTERBACKS / RUNNING BACKS…). One list, ordered QB → RB → WR → TE;
  the colored position under each name does the grouping. Per-position salary totals live on the Cap tab.
- YRS: contract years left, minimum **1** (no "FINAL"). `1 YR` in orange (`--fall`) as the expiring signal.
- STATUS: MFL's `contractStatus`, shown as-is (e.g. `3.1`), blank when MFL has none.
  Already fetched in `lib/mfl/rosters.ts`.
- Injury: Sleeper `injury_status` as a small orange tag beside the name (Q, D, O, IR, PUP, SUS) —
  the same tag as the matchup page. Healthy = no tag.

### Contract value (VALUE column + Cap tab lists)

Surplus value: what the player's production costs on this league's own market, minus what he's paid.
League salary cap: **$2,200**. Money everywhere uses thousands separators (`$1,196.80`).

**Inputs** (all already fetched somewhere in the app):
- Every rostered player's `salary` and contract years, all franchises — MFL `rosters` (`lib/mfl/rosters.ts`).
- YTD fantasy points — MFL `playerScores` YTD (`mflScores('YTD')` in `lib/players.ts`).
- Games played — Sleeper season stats (`gp`), as the player card uses.
- Position — MFL players.

**Calculation**, rebuilt once per data refresh, league-wide:
1. For every rostered player compute PPG (YTD pts ÷ games played).
   - Early season (fewer than 4 games played league-wide), blend toward last season's PPG,
     weighted by games played: `ppg = (gp·ytdPPG + (4−gp)·lastPPG) / 4`. Rookies with no prior
     season use their projection instead.
2. Rank players within each position by PPG → positional rank (QB1, RB6, WR33…).
3. **Market price** for a rank = median salary of rostered players at that position whose PPG rank
   falls within a band around it (±3 ranks, i.e. a 7-player window; widen to ±5 when the band has
   fewer than 4 salaried players). Median, not mean, so one outlier contract doesn't set the price.
   **Rookie and minimum contracts are scored but don't set the price**: they're left out of the
   market sample (their salary was set by the draft slot or the league floor, not by bidding), but
   they still get a VALUE against that market — so a rookie playing like an RB6 shows as a big steal.
   - "Minimum" = salary at the league's minimum salary (from MFL league settings).
   - "Rookie" = on a rookie-draft contract. How MFL marks this in this league (a `contractStatus`
     code, `contractInfo`, or draft-year data) still needs confirming against real roster data.
   - If a band has fewer than 4 qualifying salaries even at ±5 ranks (common deep down the WR list,
     where most players are on minimums), use the nearest band up the rankings that does; if none,
     VALUE shows `—`.
4. **VALUE (per season)** = market price − salary.
   - Shown on the Roster tab as `+$150` (`--rise`), `−$88` (`--fall`), or `fair` (`--ink-3`)
     when |VALUE| < $25 (about 1% of the $2,200 cap). Whole dollars, thousands separators.
5. **Contract value** = sum over the years left of (market price − that year's cap hit), where the cap
   hit rises 10% a year (`salary × 1.1^k` for k = 0…years left − 1). Used for the Cap tab lists.

**Cap tab — BEST CONTRACTS / WORST CONTRACTS** (between the cap bar and COMMITTED):
- Up to 3 each from your roster, ranked by contract value. Players whose per-season VALUE is "fair"
  are left out. Header right-hand label: OVER CONTRACT.
- Row: position chip · name · `RB6 · $272.80 vs $423 market · 2 yrs` · total (`+$273` / `−$330`) · chevron to player card.

**Edge cases**
- Players on IR / out for the season: still computed from PPG over games played; don't hide them.
- Taxi squad: excluded from the market sample and from the lists (doesn't count against the cap).
- Players with 0 games played: VALUE shows `—`, not listed.
- Put the calculation in one module (e.g. `lib/contractValue.ts`) so the Roster column, the Cap lists,
  and later the League team pages / trade screen all read the same numbers.

## League contract rules (from the league constitution)

Use these anywhere the app projects cap hits.

- Contracts: base value, **max 5 years**, **min $5**. The cap hit rises **10% a year**:
  year k (k = 0 for the signing year) costs `base × 1.1^k`.
- Rookie contracts: 2 years for the app's projections (extension options ignored).
- **Dead cap if cut** = current year's cap hit × years remaining (including this one) × 30%.
  Example, $100 for 5 years:

  | Year (remaining) | Cap hit | Dead cap if cut |
  |---|---|---|
  | 1 (5) | $100.00 | $150.00 |
  | 2 (4) | $110.00 | $132.00 |
  | 3 (3) | $121.00 | $108.90 |
  | 4 (2) | $133.10 | $79.86 |
  | 5 (1) | $146.41 | $43.92 |

- When dead cap lands (current year vs split with next season after the Article 8 date) is **not**
  modelled — the date changes each year. The app shows the total dead cap; managers halve it
  themselves when a split applies.
- Practice (taxi) squad: 100% cap hit reduction for the current contract year — counts $0 toward
  this year's cap.

## Player card

Canvas board `A · Player card` (tweak: owner = mine / other team). A bottom sheet in the Hashmark
style, replacing the as-built light card. Opens from the Roster rows and the Cap tab contract lists.
- Header: position chip, name, injury tag, `PHI · #26 · BYE 9 · AGE 28.7 · 6'0" 233`, owner line.
- Season strip: YTD PTS · PPG · POS RNK · GP.
- CONTRACT: one row per remaining year — cap hit (+10% a year), market price, VALUE — then the
  TOTAL over the contract (same numbers as the Roster VALUE column and Cap tab lists).
- DEAD CAP IF CUT (your roster only): total, with the math under it
  (`$272.80 × 2 yrs × 30%` = `$163.68`). No Article 8 split.
- GAME LOG, newest first: week, game result, the full Standard stat line (never truncated), points.
  Bye weeks shown as a row.
- Dropped from the as-built card: the light theme, the wide tinted stats grid. ESPN news isn't on
  the mockup — decide whether it stays (below the game log) or goes.
## Open questions

- Game line team codes: short (SF, KC, GB) vs MFL codes (SFO, KCC, GBP).
- Pre-week kickoff time: where it lives on Matchups now that the strip is gone.
- Matchups screen pre-game / final states haven't been mocked yet.
- Player card: keep ESPN news or drop it.
- Contract value: how MFL marks a rookie-draft contract in this league — check against the real roster data at the start of the code pass.

## Already in code (PR #41)

You always on the left, score header center (odds / FINAL), pre-game dashes, NFL game lines
from the Sleeper scores feed. Some of these get revised by the items above.
