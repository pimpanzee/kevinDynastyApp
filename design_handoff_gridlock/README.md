# Handoff: GRIDLOCK — Fantasy Football Matchup Viewer

## Overview
A mobile-web dynasty fantasy football app ("GRIDLOCK"). Five screens: a weekly matchups list (in three time states), a matchup detail/boxscore view, a roster viewer with a franchise switcher, and league standings. Built on the "Modernist" design system (flat, architectural, red-on-white, Archivo type, zero corner radius, strong 2px rules).

## About the Design Files
The HTML files in this bundle are **design references**, not production code — interactive prototypes built in a proprietary component format (custom template bindings, loop/conditional tags, inline styles only) that will not run as-is in a normal app. They exist to communicate exact layout, spacing, type, color, copy and interaction intent.

**Task: recreate these designs in the target codebase's existing environment** (React Native, React web, SwiftUI, etc. — whatever this repo already uses), using its established patterns, component library and data layer. If no environment exists yet, choose the most appropriate stack and implement fresh. Treat the sample data hardcoded in each file's script block as placeholder/mock data — wire real data through the app's actual data layer.

## Fidelity
**High-fidelity.** Every file has exact colors (as CSS variables from the attached modernist-styles.css), exact type sizes/weights, exact spacing (px), and exact copy. Recreate pixel-perfectly. Screen width is a 390px mobile viewport (iPhone-class); layouts are single-column, not responsive beyond that.

## Design Tokens
Source of truth: modernist-styles.css (bundled here). Reference every value via its CSS variable, don't hardcode hex/px pulled from these files:
- Color: --color-bg (#f3f2f2 ground), --color-text (#201e1d), --color-accent (#ec3013, red), --color-divider, --color-neutral-100..900 and --color-accent-700 (tonal ramps)
- Type: --font-heading / --font-body, both Archivo. Headings/labels are weight 800 (heavy), body copy weight 600. All-caps labels use letter-spacing between .06em and .14em.
- Radius: 0 everywhere (no rounded corners, per system rule).
- Dividers: 2px solid --color-divider or --color-text between major sections; 1px between list rows.
- Tabular numbers (font-variant-numeric: tabular-nums) on every score/stat figure so columns align.

## Screens / Views

### 1. Weekly Matchups (Weekly Matchups.dc.html)
**Purpose:** land on the current week; see your matchup and the rest of the league at a glance; jump into any matchup's detail.
**Layout:** fixed-width 390px column, full height flex column: status-bar row → header ("GRIDLOCK" wordmark + "WEEK N" toggle button, opens an inline dropdown list of weeks) → scrollable body → 3-tab bottom nav (Matchups / Rosters / Standings, active tab has a 3px accent top border).
**Body, top to bottom:**
- Live/status strip: pulsing red dot (if live) + "LIVE" or "KICKOFF H:MM ET" label, right-aligned "N YET TO PLAY" count.
- Your matchup card (linked to Matchup Detail): two team names + records/YTP counts, then a 3-column row (home score 42px heavy / win% / away score 42px heavy), a thin win-probability bar (dark fill over light track), and an optional italicized "trash talk" note with a left accent border.
- "AROUND THE LEAGUE" section header (all-caps, 10px, letter-spaced).
- List of other matchups: each a row-pair (home line, away line) with team name, record+YTP meta, score, sub-value (proj or live score), a thin win% bar, or a "FINAL" tail label if decided. Each row links to that matchup's detail.
**States (prop-driven, phase: pre | live):** pre-kickoff shows projections instead of live scores and "SUN 1:00 ET" tails; live shows in-progress scores, players-left counts, and live bars. Two more fully-authored week states are bundled as separate files: "Weekly Matchups - Past.dc.html" (all games FINAL, week nav shows history) and "Weekly Matchups - Future.dc.html" (nothing kicked off yet). Treat all three as one screen with three data states, not three screens.
**Interactions:** tapping the week button toggles an inline list of weeks (each with a note like "LIVE", "W 118.2-101.6"); picking a past/future week navigates to the corresponding state. Tapping any matchup row navigates to Matchup Detail with that game's index (?m=N query param in the prototype — replace with real routing/IDs).

### 2. Matchup Detail (Matchup Detail.dc.html)
**Purpose:** full boxscore for one matchup — every starter and bench player, both sides, head to head.
**Layout:** status bar → header (back arrow, "WEEK 11 MATCHUP" label, live dot + LIVE/FINAL tag) → prev/next matchup pager (MATCHUP N OF M · YOURS) → score header block (same 3-col score layout as the list card) → scrollable player table → "BENCH" section (same row shape, muted weight/color).
**Row shape (starters & bench):** 3-column grid — home player (name, team/status line, points, projected) | center position pill (QB/RB/WR/TE/FLEX/K/DEF/BN) | away player (mirrored, right-aligned). Bench rows are visually de-emphasized (smaller/lighter type) vs. starters.
**States (phase: pre | live | final):** pre shows "—" for points and kickoff times; live shows live points and in-play/pending status text per player; final shows final stat lines and locked totals. Prev/next pager cycles through the user's matchup plus all "around the league" games (index 0 = yours).

### 3. Roster (Roster.dc.html)
**Purpose:** inspect any franchise's full roster (dynasty contract-style: salary, years, status) grouped by position, plus a taxi squad section.
**Layout:** status bar → header → franchise switcher bar (team name + player count, "YOUR TEAM" outline tag when applicable, tap opens a bottom-sheet dialog to switch franchises) → scrollable grouped list (QB/RB/WR/TE sticky section headers) → TAXI SQUAD section (same row shape, footnote "not counted toward roster or salary cap") → sticky footer stat bar (PLAYERS / ADJ / TOTAL) → bottom nav.
**Row shape:** name + team·position line, right-aligned salary (heavy, tabular) + years label; chevron toggles an inline expand row showing ECR / PROJ / MATCHUP (star rating, 1-5) / PTS / BYE in a 5-column grid.
**Franchise switcher dialog:** bottom sheet (design system .dialog) listing all franchises, checkmark on the active one, "YOU" tag on the user's own team.

### 4. Standings (Standings.dc.html)
**Purpose:** league standings grouped by conference/division.
**Layout:** status bar → header → scrollable list grouped by "CONFERENCE N · DIVISION N" sticky headers → bottom nav.
**Row shape:** rank number, team name, record (heavy, tabular), chevron; below that a 5-col row of PF / PA / DIV / CONF / PP (power points, accent-colored) always visible; tapping the row expands a second 5-col row of PCT / GB / STRK / AVG PF / AVG PA in a lighter weight.

## Shared Components
- Status bar row: 9px top padding, 10px letter-spaced time on the left, context label (or clock) on the right.
- Header bar: 44px min-height, 2px bottom divider, "GRIDLOCK" wordmark (800 weight, -0.02em tracking) plus a right-aligned control/label.
- Bottom tab bar: 3 equal columns, 54px tall, 2px top divider (--color-text), active tab gets a 3px accent top border and full-opacity icon/label; inactive tabs are --color-neutral-600. Icons are inline SVG — swap for the app's real icon set (design system specifies Lucide).
- Score row pattern (list card + detail header): 3-column grid, home score 42px/800 left-aligned, win% pair centered in 10px letterspaced caps, away score 42px/800 right-aligned (muted color --color-neutral-800), then a 7px win-probability bar below.
- Sticky section headers: position sticky/top 0 with solid --color-bg background so grouped lists (roster positions, standings divisions) pin while scrolling.

## Interactions & Behavior
- All navigation is via plain links between the 5 screens — replace with the app's real router/screens.
- Expand/collapse rows (Roster, Standings) are simple local toggle state, one open-state map keyed by row id.
- Franchise switcher and week picker are simple open/closed local state, instant show/hide (dialog is a bottom sheet from the design system, backdrop tap closes it).
- Live-state pulsing dot: opacity keyframe animation, 1.4s infinite, 100%→15%→100%.
- No form validation, loading states, or error states are modeled in these prototypes — mock data renders instantly. The real app will need loading/error handling around live score polling.

## State Management
Per-screen local state only, no shared app state modeled in the prototypes (each file hardcodes its own sample data). For the real implementation, the underlying data needs:
- Current week + list of weeks (past results, current, upcoming) with per-week status.
- Per-matchup: two franchises, their live/final scores, per-player boxscore rows (starters + bench), projections, win probability.
- Per-franchise: full roster (position, team, ECR rank, salary/cap value, contract years remaining, contract status, weekly matchup-strength rating, season points, bye week), plus a separate taxi squad list.
- League standings: conference/division groupings, record, points for/against, division/conference record, "power points" (power ranking metric distinct from standings points), win pct, games back, streak, per-game averages.

## Assets
No image assets — all icons are inline SVG (outline style, 1.6-2px stroke). The design system specifies Lucide icons for production; the SVGs in these files are close matches. No photography used on these particular screens.

## Files
- Weekly Matchups.dc.html — matchups list, live/pre states via a phase prop
- Weekly Matchups - Past.dc.html — matchups list, all-final week state (originally "Weekly Matchups - Past (Final).dc.html")
- Weekly Matchups - Future.dc.html — matchups list, not-yet-started week state (originally "Weekly Matchups - Future (Not Started).dc.html")
- Matchup Detail.dc.html — full boxscore, pre/live/final states via a phase prop, ?m=N selects which matchup
- Roster.dc.html — franchise roster + taxi squad + franchise switcher
- Standings.dc.html — league standings by conference/division
- modernist-styles.css — the design system's token sheet and component CSS referenced by all screens above (colors, type, spacing as CSS variables)

Each .dc.html file's markup/logic is self-contained, but it pulls the design-system CSS/JS via relative `_ds/...` paths not included in this bundle — for live rendering reference, view the originals in the source project rather than standalone.
