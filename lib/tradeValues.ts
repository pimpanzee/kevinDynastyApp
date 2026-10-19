import { cached } from '@/lib/mfl/cache';
import type { TeamsData } from '@/lib/types';

/**
 * Dynasty trade values from DynastyProcess (github.com/dynastyprocess/data,
 * refreshed weekly): one number per player and per draft pick, on their
 * 0–10,500 scale, for the trade screen's analyzer. Read at build time; a
 * failed read leaves the analyzer off rather than failing the build.
 */

const BASE = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files';
const DAY = 24 * 60 * 60 * 1000;

export interface TradeValues {
  /** MFL player id → value. */
  players: Record<string, number>;
  /** "2027 Pick 1.04", "2027 Early 1st", "2027 1st" → value. */
  picks: Record<string, number>;
  /** Values for leagues that can start two QBs. */
  superflex: boolean;
}

/** DynastyProcess turns a consensus rank into a value with this curve. */
const fromRank = (ecr: number) => Math.round(10500 * Math.exp(-0.0235 * ecr));

/** A small CSV reader: quoted fields, commas inside quotes, no newlines inside fields. */
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const row = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const [head, ...rest] = lines;
  if (!head) return [];
  const keys = row(head);
  return rest.map((l) => {
    const cells = row(l);
    return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? '']));
  });
}

async function csv(name: string): Promise<Array<Record<string, string>>> {
  const res = await fetch(`${BASE}/${name}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`DynastyProcess ${name}: ${res.status}`);
  return parseCsv(await res.text());
}

export async function getTradeValues(superflex: boolean): Promise<TradeValues | null> {
  try {
    return await cached(`dynastyprocess:${superflex ? '2qb' : '1qb'}`, DAY, async () => {
      const [values, ids, picks] = await Promise.all([csv('values-players.csv'), csv('db_playerids.csv'), csv('values-picks.csv')]);
      const mflByFp = new Map<string, string>();
      for (const r of ids) if (r.fantasypros_id && r.fantasypros_id !== 'NA' && r.mfl_id && r.mfl_id !== 'NA') mflByFp.set(r.fantasypros_id, r.mfl_id);
      const players: Record<string, number> = {};
      for (const r of values) {
        const mfl = mflByFp.get(r.fp_id);
        const v = Number(superflex ? r.value_2qb : r.value_1qb);
        if (mfl && Number.isFinite(v)) players[mfl] = v;
      }
      const pickValues: Record<string, number> = {};
      for (const r of picks) {
        const ecr = Number(superflex ? r.ecr_2qb : r.ecr_1qb);
        if (r.player && Number.isFinite(ecr)) pickValues[r.player] = fromRank(ecr);
      }
      if (!Object.keys(players).length) throw new Error('DynastyProcess: no player values matched');
      return { players, picks: pickValues, superflex };
    });
  } catch (e) {
    console.warn(`Trade values unavailable: ${(e as Error).message}`);
    return null;
  }
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

/**
 * A pick's value: the exact slot when DynastyProcess lists it ("2027 Pick
 * 1.04"), else early, mid or late in the round by projected slot, else the
 * round as a whole. Years further out than DynastyProcess goes use its
 * furthest year. Null when there's nothing to go on (late rounds).
 */
export function pickValue(values: TradeValues, year: number, round: number, slot: number | null, teams: number): number | null {
  const p = values.picks;
  if (slot) {
    const exact = p[`${year} Pick ${round}.${String(slot).padStart(2, '0')}`];
    if (exact !== undefined) return exact;
    const third = slot <= teams / 3 ? 'Early' : slot > (2 * teams) / 3 ? 'Late' : 'Mid';
    const band = p[`${year} ${third} ${ORD[round]}`];
    if (band !== undefined) return band;
  }
  const whole = p[`${year} ${ORD[round]}`];
  if (whole !== undefined) return whole;
  const years = Object.keys(p).map((k) => Number(k.slice(0, 4))).filter((y) => y > 0);
  const last = years.length ? Math.max(...years) : 0;
  return last && year > last ? p[`${last} ${ORD[round]}`] ?? null : null;
}

/**
 * Every rostered player's and held pick's value, keyed as the trade screens
 * key them (player id, or the pick's FP_ id). Null when values couldn't load.
 */
export async function assetValues(data: TeamsData, superflex: boolean): Promise<Record<string, number> | null> {
  const dp = await getTradeValues(superflex);
  if (!dp) return null;
  const values: Record<string, number> = {};
  for (const t of data.teams) {
    for (const p of t.roster) if (dp.players[p.id] !== undefined) values[p.id] = dp.players[p.id]!;
    for (const y of t.picks) {
      for (const k of y.picks) {
        if (!k.held || !k.asset) continue;
        const v = pickValue(dp, y.year, k.round, k.slotNum ?? null, data.teams.length);
        if (v !== null) values[k.asset] = v;
      }
    }
  }
  return values;
}
