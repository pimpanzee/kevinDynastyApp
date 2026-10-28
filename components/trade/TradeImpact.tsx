'use client';

import { useState } from 'react';
import { DISPLAY } from '@/components/team/format';
import type { TitleEquity } from '@/lib/mfl/playoffOdds';
import { teamImpact } from '@/lib/titleEquity';
import type { TeamsData, TeamView } from '@/lib/types';

type Lens = 'now' | 'later';

/**
 * What a trade does for each team, two ways:
 * - WIN NOW: this season's playoff odds, title odds and expected league
 *   winnings before and after (title equity, lib/titleEquity.ts);
 * - REBUILD: contract value after this season, the cap dollars the players'
 *   later contract years are worth over their salaries.
 * Opens on WIN NOW when your playoff odds are 25% or better, else REBUILD.
 */
export default function TradeImpact({ data, me, them, give, get, equity }: {
  data: TeamsData; me: TeamView; them: TeamView; give: string[]; get: string[]; equity: TitleEquity | null;
}) {
  const sent = me.roster.filter((p) => give.includes(p.id));
  const received = them.roster.filter((p) => get.includes(p.id));
  const mine = equity && teamImpact(equity, me.id, me.roster, give, received, data.lineup);
  const theirs = equity && teamImpact(equity, them.id, them.roster, get, sent, data.lineup);
  const [lens, setLens] = useState<Lens>(() => (!mine || mine.before.playoffs >= 0.25 ? 'now' : 'later'));
  const picks = [...give, ...get].some((k) => k.startsWith('FP_') || k.startsWith('DP_'));

  const later = (xs: typeof sent) => xs.reduce((t, p) => t + (p.futureValue ?? 0), 0);
  const rebuild = [
    { name: 'You', d: later(received) - later(sent) },
    { name: them.name, d: later(sent) - later(received) },
  ];

  const lensBtn = (k: Lens, label: string) => {
    const on = lens === k;
    return (
      <button key={k} type="button" aria-pressed={on} onClick={() => setLens(k)} style={{ height: 26, padding: '0 10px', border: 0, borderRadius: 2, background: on ? 'var(--volt)' : 'transparent', color: on ? 'var(--on-volt)' : 'var(--ink-3)', font: DISPLAY(10.5), letterSpacing: '.1em', cursor: 'pointer' }}>{label}</button>
    );
  };

  return (
    <div style={{ margin: '12px 16px 0' }}>
      <div style={{ border: '1px solid var(--line)', borderRadius: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 6px 0 12px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>TRADE IMPACT</span>
          <div role="group" aria-label="Lens" style={{ marginLeft: 'auto', display: 'flex', gap: 2, padding: 2, borderRadius: 3, background: 'var(--bg-200)' }}>
            {lensBtn('now', 'WIN NOW')}
            {lensBtn('later', 'REBUILD')}
          </div>
        </div>
        {lens === 'now' ? (
          mine && theirs ? (
            <>
              <div style={{ ...row, height: 26, font: DISPLAY(9.5), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
                <span /><span style={{ textAlign: 'right' }}>PLAYOFFS</span><span style={{ textAlign: 'right' }}>TITLE</span><span style={{ textAlign: 'right' }}>WINNINGS</span>
              </div>
              {[{ name: 'You', x: mine }, { name: them.name, x: theirs }].map(({ name, x }) => (
                <div key={name} style={{ ...row, height: 50, borderTop: '1px solid var(--line)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ font: '600 13.5px/1.2 var(--font-body)', ...clip }}>{name}</span>
                    <span style={{ font: '500 10.5px/1 var(--font-body)', color: 'var(--ink-3)' }}>{signed(x.delta, 1)} pts/wk</span>
                  </span>
                  <Cell after={pct(x.after.playoffs)} d={x.after.playoffs - x.before.playoffs} fmt={(d) => `${signed(d * 100, 0)}`} />
                  <Cell after={pct(x.after.title)} d={x.after.title - x.before.title} fmt={(d) => `${signed(d * 100, 1)}`} />
                  <Cell after={`$${Math.round(x.after.winnings)}`} d={x.after.winnings - x.before.winnings} fmt={(d) => `${d < 0 ? '−' : '+'}$${Math.abs(Math.round(d))}`} />
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: 12, font: '500 12.5px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>The regular season and playoffs are over, so there are no odds to move.</div>
          )
        ) : (
          <>
            <div style={{ ...row, gridTemplateColumns: '1fr 140px', height: 26, font: DISPLAY(9.5), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
              <span /><span style={{ textAlign: 'right' }}>VALUE AFTER {data.season}</span>
            </div>
            {rebuild.map((t) => (
              <div key={t.name} style={{ ...row, gridTemplateColumns: '1fr 140px', height: 44, borderTop: '1px solid var(--line)' }}>
                <span style={{ font: '600 13.5px/1.2 var(--font-body)', ...clip }}>{t.name}</span>
                <b style={{ textAlign: 'right', font: DISPLAY(15), color: Math.round(t.d) > 0 ? 'var(--rise)' : Math.round(t.d) < 0 ? 'var(--fall)' : 'var(--ink)' }}>{t.d < -0.5 ? '−' : '+'}${Math.abs(Math.round(t.d))}</b>
              </div>
            ))}
          </>
        )}
      </div>
      <div style={{ margin: '6px 0 0', font: '500 11.5px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>
        {lens === 'now'
          ? `This season, from ${equity?.sims.toLocaleString('en-US') ?? 0} simulated seasons with each team's best lineup after the trade. Winnings are league money: $${equity?.payouts.first ?? 640} / $${equity?.payouts.second ?? 320} / $${equity?.payouts.third ?? 120} for the top three plus $${equity?.payouts.perWin ?? 10} a win. Players on IR count as zero.`
          : `Contract value of the players' years after this season, in cap dollars: what their production would cost at auction minus their salaries, later years discounted.${picks ? ' Draft picks aren’t valued.' : ''}`}
      </div>
    </div>
  );
}

function Cell({ after, d, fmt }: { after: string; d: number; fmt: (d: number) => string }) {
  const tone = d > 0.0005 ? 'var(--rise)' : d < -0.0005 ? 'var(--fall)' : 'var(--ink-3)';
  return (
    <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <b style={{ font: DISPLAY(15) }}>{after}</b>
      <span style={{ font: '500 10.5px/1 var(--font-body)', color: tone }}>{fmt(d)}</span>
    </span>
  );
}

const pct = (p: number) => (p > 0 && p < 0.005 ? '<1%' : p > 0.995 && p < 1 ? '>99%' : `${Math.round(p * 100)}%`);
const signed = (x: number, digits: number) => `${x < -(0.5 / 10 ** digits) ? '−' : '+'}${Math.abs(x).toFixed(digits)}`;
const row = { display: 'grid', gridTemplateColumns: '1fr 64px 64px 72px', alignItems: 'center', padding: '0 12px', fontVariantNumeric: 'tabular-nums' } as const;
const clip = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
