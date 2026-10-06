/**
 * Per-player scoring detail: the box-score byline under a player and the
 * breakdown of how their stats became fantasy points.
 *
 * MFL exposes each player's points but not the stats behind them, so stats
 * come from Sleeper's public API and are scored here with this league's own
 * MFL rules. Checked against MFL's weekly results for the 2025 season, the
 * two agree to the hundredth for every player.
 *
 * Pure and client-safe: the build uses it for settled games, and the browser
 * re-runs it on fresh stats during live games.
 */

/** One week of stats for one player or team defence, keyed as Sleeper keys them. */
export type Stats = Record<string, number>;

/** One MFL scoring rule, parsed. */
export interface Rule {
  /** MFL event code: "PY", "#P", "TPA"… */
  event: string;
  lo: number;
  hi: number;
  /** True for "*0.04"-style rules (points per unit); false for a flat award. */
  per: boolean;
  points: number;
}

/** Rules by scoring group. A player uses the group whose positions include theirs. */
export type RuleSet = Array<{ positions: string[]; rules: Rule[] }>;

export interface BreakdownRow {
  label: string;
  /** The stat as counted, e.g. "412". Blank on an adjustment row. */
  stat: string;
  /** Points per unit ("0.04"), or "FLAT" for an award by range. */
  per: string;
  points: string;
}

export interface Breakdown {
  rows: BreakdownRow[];
  total: string;
}

const isDefence = (position: string) => position === 'Def' || position.startsWith('TM');

/** Where each MFL event's count comes from, for players and for team defences. */
const PLAYER_SOURCES: Record<string, string[]> = {
  '#P': ['pass_td'], PY: ['pass_yd'], IN: ['pass_int'], TSY: ['pass_sack_yds'], P2: ['pass_2pt'],
  '#R': ['rush_td'], RY: ['rush_yd'], R2: ['rush_2pt'],
  '#C': ['rec_td'], CY: ['rec_yd'], CC: ['rec'], C2: ['rec_2pt'],
  '#F': ['fgm'], '#M': ['fgmiss'], EP: ['xpm'], EM: ['xpmiss'],
  // Sleeper books return TDs as one special-teams figure.
  '#UT': ['st_td'], UY: ['pr_yd'], '#KT': [], KY: ['kr_yd'],
  FL: ['fum_lost'],
};
const DEFENCE_SOURCES: Record<string, string[]> = {
  TSY: ['sack_yd'], SK: ['sack'], PI: ['punt_in_20'], FC: ['fum_rec'], IC: ['int'],
  BLF: ['blk_kick'], BLP: [], BLE: [], SF: ['safe'],
  TPA: ['pts_allow'], TYA: ['yds_allow'], '#T': ['def_st_td'],
};

const LABELS: Record<string, string> = {
  '#P': 'Passing TD', PY: 'Passing Yards', IN: 'Interceptions', TSY: 'Sack Yards Lost', P2: 'Passing 2-Pt',
  '#R': 'Rushing TD', RY: 'Rushing Yards', R2: 'Rushing 2-Pt',
  '#C': 'Receiving TD', CY: 'Receiving Yards', CC: 'Receptions', C2: 'Receiving 2-Pt',
  '#F': 'Field Goals', FG: 'FG Distance', '#M': 'FG Missed', EP: 'Extra Points', EM: 'XP Missed',
  '#UT': 'Return TD', UY: 'Punt Return Yards', '#KT': 'Kick Return TD', KY: 'Kick Return Yards',
  FL: 'Fumbles Lost',
};
const DEFENCE_LABELS: Record<string, string> = {
  TSY: 'Sack Yards', SK: 'Sacks', PI: 'Punts Inside 20', FC: 'Fumble Recoveries', IC: 'Interceptions',
  BLF: 'Blocked Kicks', BLP: 'Blocked Punts', BLE: 'Blocked XP', SF: 'Safeties',
  TPA: 'Points Allowed', TYA: 'Yards Allowed', '#T': 'Def / ST TD',
};

/** Parse MFL's `rules` export. Ranges look like "0-10" or "-50-999". */
export function parseRules(raw: Array<{ positions: string; rule: Array<Record<string, { $t?: string }>> | Record<string, { $t?: string }> }>): RuleSet {
  return raw.map((group) => ({
    positions: group.positions.split('|'),
    rules: (Array.isArray(group.rule) ? group.rule : [group.rule]).flatMap((r): Rule[] => {
      const event = r.event?.$t ?? '';
      const range = (r.range?.$t ?? '').match(/^(-?[\d.]+)-(-?[\d.]+)$/);
      const pts = r.points?.$t ?? '';
      if (!event || !range) return [];
      const per = pts.startsWith('*');
      const points = parseFloat(per ? pts.slice(1) : pts);
      if (!Number.isFinite(points)) return [];
      return [{ event, lo: Number(range[1]), hi: Number(range[2]), per, points }];
    }),
  }));
}

function statValue(stats: Stats, keys: string[]): number {
  return keys.reduce((t, k) => t + (stats[k] ?? 0), 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtPts = (n: number) => n.toFixed(2);
const fmtStat = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** "0.04", "4.00", "-0.10": two places, more only when the rule needs them. */
const fmtPer = (n: number) => n.toFixed(Math.max(2, (String(n).split('.')[1] ?? '').length));

/**
 * Score a stat line with the league's rules. `official` is the score the app
 * shows for the player (MFL's); when the stats and it disagree — a stat
 * correction, or live data from the two sources landing at different times —
 * the gap shows as its own row so the table always adds up to the score.
 */
export function scoreBreakdown(position: string, stats: Stats, rules: RuleSet, official: number): Breakdown {
  const group = rules.find((g) => g.positions.includes(position));
  const def = isDefence(position);
  const sources = def ? DEFENCE_SOURCES : PLAYER_SOURCES;
  const labels = def ? DEFENCE_LABELS : LABELS;

  const rows: Array<BreakdownRow & { value: number }> = [];
  for (const rule of group?.rules ?? []) {
    let count: number;
    let pts: number;
    if (rule.event === 'FG' && !def) {
      // MFL scores each made field goal by its length. Sleeper gives total
      // yards of made kicks; a rule starting past 30 yards applies to all of
      // them unless some were short, which Sleeper's buckets reveal.
      const short = (stats.fgm_0_19 ?? 0) + (stats.fgm_20_29 ?? 0);
      if (rule.lo > 30 && short > 0) continue;
      if (rule.lo > 30 || (rule.hi <= 30 && (stats.fgm ?? 0) === short)) {
        count = stats.fgm_yds ?? 0;
        pts = rule.per ? count * rule.points : (count ? rule.points : 0);
      } else continue;
    } else {
      const keys = sources[rule.event] ?? [];
      // A flat award on a stat that was never reported (no game) is not earned.
      if (!rule.per && !keys.some((k) => k in stats)) continue;
      count = statValue(stats, keys);
      if (count < rule.lo || count > rule.hi) continue;
      // A per-unit rule on a zero count scores nothing; a flat one (points
      // allowed tiers) still applies.
      if (rule.per && count === 0) continue;
      pts = rule.per ? count * rule.points : rule.points;
    }
    if (round2(pts) === 0 && rule.per) continue;
    if (round2(pts) === 0 && !def) continue;
    rows.push({
      label: labels[rule.event] ?? rule.event,
      stat: fmtStat(count),
      per: rule.per ? fmtPer(rule.points) : 'FLAT',
      points: fmtPts(pts),
      value: pts,
    });
  }

  const sum = round2(rows.reduce((t, r) => t + r.value, 0));
  const gap = round2(official - sum);
  if (Math.abs(gap) >= 0.01) rows.push({ label: 'Other', stat: '', per: '', points: fmtPts(gap), value: gap });

  return { rows: rows.map(({ value: _, ...r }) => r), total: fmtPts(official) };
}

/** Box-score byline, e.g. "32/52 CMP, 412 YD, 1 TD, 1 INT". Empty when there is nothing to say. */
export function statLine(position: string, s: Stats): string {
  const n = (k: string) => s[k] ?? 0;
  const parts: string[] = [];
  const add = (cond: boolean, text: string) => { if (cond) parts.push(text); };

  // Each part stays on one line when the byline wraps: "2 YD", never "2 / YD".
  const done = () => parts.map((p) => p.replace(/ /g, '\u00a0')).join(', ');

  if (isDefence(position)) {
    add(n('sack') > 0, `${fmtStat(n('sack'))} SACK`);
    add(n('int') > 0, `${n('int')} INT`);
    add(n('fum_rec') > 0, `${n('fum_rec')} FR`);
    add(n('def_st_td') > 0, `${n('def_st_td')} TD`);
    add(n('safe') > 0, `${n('safe')} SFTY`);
    add('pts_allow' in s, `${n('pts_allow')} PA`);
    add('yds_allow' in s, `${n('yds_allow')} YDS ALLOWED`);
    return done();
  }

  if (position === 'PK') {
    add(n('fgm') + n('fgmiss') > 0, `${n('fgm')}/${n('fgm') + n('fgmiss')} FG`);
    add(n('fgm_lng') > 0, `LNG ${n('fgm_lng')}`);
    add(n('xpm') + n('xpmiss') > 0, `${n('xpm')}/${n('xpm') + n('xpmiss')} XP`);
    return done();
  }

  if (n('pass_att') > 0) {
    parts.push(`${n('pass_cmp')}/${n('pass_att')} CMP`, `${n('pass_yd')} YD`);
    add(n('pass_td') > 0, `${n('pass_td')} TD`);
    add(n('pass_int') > 0, `${n('pass_int')} INT`);
  }
  const rushFirst = position !== 'WR' && position !== 'TE';
  const rush = () => {
    if (n('rush_att') > 0) {
      parts.push(`${n('rush_att')} CAR`, `${n('rush_yd')} YD`);
      add(n('rush_td') > 0, `${n('rush_td')} TD`);
    }
  };
  const rec = () => {
    if (n('rec_tgt') > 0 || n('rec') > 0) {
      parts.push(`${n('rec')}/${Math.max(n('rec_tgt'), n('rec'))} REC`, `${n('rec_yd')} YD`);
      add(n('rec_td') > 0, `${n('rec_td')} TD`);
    }
  };
  if (rushFirst) { rush(); rec(); } else { rec(); rush(); }
  add(n('st_td') > 0, `${n('st_td')} RET TD`);
  add(n('fum_lost') > 0, `${n('fum_lost')} FUM LOST`);
  return done();
}

/** Sleeper stat keys this module reads — everything else is trimmed before shipping. */
export const STAT_KEYS = [
  ...new Set([
    ...Object.values(PLAYER_SOURCES).flat(),
    ...Object.values(DEFENCE_SOURCES).flat(),
    'pass_att', 'pass_cmp', 'rush_att', 'rec_tgt', 'sack',
    'fgm_yds', 'fgm_lng', 'fgm_0_19', 'fgm_20_29',
  ]),
];

/** Keep only the keys scoring and bylines use. */
export function trimStats(s: Stats | undefined): Stats {
  const out: Stats = {};
  if (!s) return out;
  for (const k of STAT_KEYS) if (s[k] !== undefined) out[k] = s[k];
  return out;
}
