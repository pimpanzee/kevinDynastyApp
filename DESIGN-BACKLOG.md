# Design backlog

Design decisions settled on the Option A (Hashmark) canvas, waiting for one code pass once
every screen's design is final. Nothing here is built yet unless marked.

Canvas: https://claude.ai/artifact/CDgoN9eCg8NCKutK6Ceowa — boards `A · Matchups` and `A · Matchup detail`.

## Matchups screen

- Remove the LIVE / kickoff / YTP strip.
- Top 6 race (the weekly bonus VP for the six top scorers — not playoffs, so it stays as is): label reads PROJECTED or FINAL (never LIVE). No greying out of teams below the
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

## League

Canvas boards: `A · League › Standings`, `A · League › Ratings`, `A · League › Activity`, `A · League › Hollow Point`.

- League tabs: **STANDINGS · RATINGS · ACTIVITY** (league-wide Cap and Picks cut for now).

### Standings

- Split by conference, then division (2 conferences × 2 divisions × 3 teams; names from MFL).
  Conference header, then per division a sub-header row with the division name and the column
  labels, then its teams ordered by VP then PF.
- Columns: TEAM (logo + name) · **VP** · W-L · STRK · PF · PA · AVG PF · AVG PA · DIV (W-L) · CONF (W-L).
  Wide table: scrolls sideways with the team column pinned. VP in the display face; streak in blue
  (W) or orange (L); PF/PA one decimal with thousands separators.
- Team logo: the MFL franchise icon in a 26px rounded square; team initials on a tint as fallback.
- No seed tags (DIV / WC) and no YOU tag — your row is just raised (`--bg-200`) with a volt left edge.
- Playoffs: per conference, the **two division winners + one wild card** (best VP among the
  non-winners in that conference, PF breaks ties) = 6 teams. Under each conference, one line on the
  wild-card race: `WILD CARD · Gridiron Ghosts leads Mahomes Depot by 3 VP`, or on a VP tie
  `… holds it over North End Nine on points (both 9 VP)`.
- Rows open the team page.

### Ratings (this season only)

Canvas board `A · League › Ratings`. One table ranked by power score; scrolls sideways with rank + team pinned.
- Row: rank (leader in volt), move since last week (`▲2` blue / `▼1` orange / `–`), logo, name ·
  **PWR** · ELO · ALL-PLAY · LUCK. Your row raised with a volt left edge. Rows open the team page.
- **PWR** (0–100, 50 = average team): z-score of each input across the league, weighted
  all-play win % 40% · last-3-weeks scoring 25% · PF 20% · lineup efficiency (PF ÷ potential points) 15%,
  then `50 + 15 × weighted z`, clamped to 0–100, rounded.
- **ELO**: every team starts the season at 1500; after each matchup the winner takes
  `K × (result − expected)` from the loser, expected = `1 / (1 + 10^((Rb − Ra)/400))`, K = 32, scaled
  up a little by margin (e.g. × `ln(|margin| + 1)` capped). Current season only for now — all-time
  ELO (every MFL season, with a 1/3 pull toward 1500 between seasons) is a later option.
- **ALL-PLAY**: record if you'd played every other team every week (`86-24` after 10 weeks × 11 opponents).
- **LUCK**: actual wins − all-play expected wins (`all-play W% × games`), one decimal, blue when
  ≥ +0.5, orange when ≤ −0.5, grey in between.
- A short explainer under the table says what each number means.
- Inputs: MFL weekly results and scores (already fetched for standings) and potential points
  (`lib/mfl/standings.ts`).

### Team page (another team)

- Reuses the My Team screens: same team header line (`8-2 · 16 VP · 118.4 AVG PF · 1,341.7 PP`),
  same ROSTER / CAP / PICKS tabs and layouts, same roster table with VALUE (useful for trades).
- Top bar: `← LEAGUE` back, `PROPOSE TRADE` (volt). Bottom tab bar: LEAGUE lit.
- No dead cap anywhere for another team's players (player card in "other team" mode).

### Activity

- Filter chips only: ALL · TRADES · WAIVERS · DROPS · IR / TAXI (no team filter).
- Grouped by week (`THIS WEEK · WEEK 11`), newest first.
- Each entry: kind tag (TRADE in volt; others grey), title, time, COMMISH tag when the commissioner
  made it. Entries that are yours get the raised row and a volt left edge.
- Trade: two columns, `RIDGE RUNNERS GET` / `IRON LUNG FC GET`, each asset with colored position,
  NFL team, salary and years; picks in pick purple (`2026 R3 · Ridge Runners'`).
- **Waivers run daily**: every claim from one run is a single WAIVER entry (`Waiver run · 3 claims`),
  with a labelled block per team listing its adds and drops; your block is raised.
- Moves: one line per player — `+` added (blue), `−` dropped (orange), `→` status change. Right side:
  an add shows his new salary and years (`$52.80 · 1 YR`); IR/taxi moves say `TO IR` / `OFF TAXI`;
  drops show nothing extra (no dead cap).
- Source: MFL transactions (`lib/transactions.ts`).

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

Canvas board `A · Player card` (tweak: owner = mine / other team / free agent). A bottom sheet in the
Hashmark style, replacing the as-built light card. Opens from the Roster rows and the Cap tab lists.
- Header: position chip, name, injury tag, then two sublines:
  1. `PHI · #26 · BYE 9 · AGE 28.7`
  2. Contract, by owner:
     - yours: `$272.80 · 2 YRS · $163.68 DEAD CAP` (dead cap in `--fall`; the number only, no math shown)
     - another team's: `Hollow Point · $272.80 · 2 YRS`
     - free agent: `Free agent` (in volt) `· $423 MARKET` — the contract-value market price for his
       production, as a bidding guide.
- Stat strip: YTD PTS · PPG · POS RNK · OVR RNK (rank by fantasy points across all positions, `#14`).
- LATEST NEWS (before the game log), newest first. Collapsed: newest item open (headline,
  `18 hours ago · via FantasyPros`, body clamped to 2 lines) + one older headline, and `ALL NEWS (n)`.
  Tapping ALL NEWS expands the list in place — no new screen: every item as a one-line headline with
  its age, the newest open with its full text and `READ ON FANTASYPROS ↗` (opens the source outside
  the app). Tapping a headline opens it and closes the other; the link becomes `SHOW LESS`.
  Source: the news feed the app already uses. Canvas tweak: news = collapsed / expanded.
- GAME LOG, Sleeper-style: current season only (no season chips), one row per week in order, bye weeks
  as a row. Column groups by position — RB: FANTASY (PROJ, FPTS) · SNP% · RUSHING (ATT, YD, YPC, TD)
  · RECEIVING (TAR, REC, YD, TD) · FUMBLE (LOST). QB adds PASS (ATT, CMP, YD, TD, INT) and SACKED
  (SK, YDS); WR/TE lead with RECEIVING. FPTS from league scoring. Cells tinted against his season
  average (≥115% blue, ≤85% orange; fumbles orange when > 0), zeros shown as `-`. Scrolls sideways
  with WK and OPP pinned.
- No contract-by-year table and no VALUE on the card.
## Open questions

- Game line team codes: short (SF, KC, GB) vs MFL codes (SFO, KCC, GBP).
- Pre-week kickoff time: where it lives on Matchups now that the strip is gone.
- Matchups screen pre-game / final states haven't been mocked yet.
- Contract value: how MFL marks a rookie-draft contract in this league — check against the real roster data at the start of the code pass.

## Already in code (PR #41)

You always on the left, score header center (odds / FINAL), pre-game dashes, NFL game lines
from the Sleeper scores feed. Some of these get revised by the items above.
