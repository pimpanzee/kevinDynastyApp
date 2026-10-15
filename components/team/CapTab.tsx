'use client';

import { usePlayerCard } from '@/components/PlayerCard';
import { posColor } from '@/components/pos';
import type { TeamPlayer, TeamsData, TeamView } from '@/lib/types';
import SectionHead from './SectionHead';
import { DISPLAY, money, signedDollars } from './format';

const SPLIT_COLOR: Record<string, string> = { QB: 'var(--pos-qb)', RB: 'var(--pos-rb)', WR: 'var(--pos-wr)', TE: 'var(--pos-te)', IR: 'var(--edge)' };

const Chevron = () => (
  <span style={{ display: 'flex', color: 'var(--ink-3)' }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
  </span>
);

/**
 * This season's cap by position, best and worst contracts, committed salary
 * by year (signed contracts + the rookie salaries of picks held), expiring deals.
 */
export default function CapTab({ data, team }: { data: TeamsData; team: TeamView }) {
  const card = usePlayerCard();
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  const cap = data.cap;
  const lists = [
    { label: 'BEST CONTRACTS', ids: team.best },
    { label: 'WORST CONTRACTS', ids: team.worst },
  ].filter((l) => l.ids.length);
  const expiring = team.expiring.map((id) => byId.get(id)).filter((p): p is TeamPlayer => Boolean(p));
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / cap) * 100))}%`;

  const row = (p: TeamPlayer, detail: string, right: string, tone: string) => (
    <button key={p.id} type="button" onClick={() => card?.open(p.id)} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto 16px', alignItems: 'center', gap: 10, height: 46, width: '100%', padding: '0 16px', border: 0, borderBottom: '1px solid var(--line)', background: 'none', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20, borderRadius: 2, background: posColor(p.pos), color: 'var(--on-volt)', font: DISPLAY(10), letterSpacing: '.08em' }}>{p.pos}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: '600 14px/1.25 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
        <div style={{ font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)', marginTop: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</div>
      </div>
      <span style={{ font: DISPLAY(16), fontVariantNumeric: 'tabular-nums', color: tone }}>{right}</span>
      <Chevron />
    </button>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <SectionHead gap={false} label={`${data.season} CAP`} right={money(cap)} />
      <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: DISPLAY(28, 800), fontVariantNumeric: 'tabular-nums' }}>{money(team.used)}</span>
          <span style={{ font: DISPLAY(12), letterSpacing: '.1em', color: 'var(--ink-3)' }}>USED</span>
          <span style={{ marginLeft: 'auto', font: DISPLAY(20, 800), fontVariantNumeric: 'tabular-nums', color: team.room < 0 ? 'var(--live)' : 'var(--rise)' }}>{money(team.room)}</span>
          <span style={{ font: DISPLAY(12), letterSpacing: '.1em', color: 'var(--ink-3)' }}>ROOM</span>
        </div>
        <div role="img" aria-label={`Cap: ${team.split.map((s) => `${s.label} ${money(s.amount)}`).join(', ')}, room ${money(team.room)} of ${money(cap)}`} style={{ display: 'flex', gap: 2, height: 12, marginTop: 12 }}>
          {team.split.map((s) => <span key={s.label} style={{ width: pct(s.amount), background: SPLIT_COLOR[s.label], borderRadius: 1 }} />)}
          <span style={{ flex: 1, background: 'var(--bg-300)', borderRadius: 1 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
          {team.split.map((s) => (
            <div key={s.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, font: DISPLAY(11), letterSpacing: '.08em', color: 'var(--ink-3)' }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 1, background: SPLIT_COLOR[s.label] }} />{s.label}
              </div>
              <div style={{ font: '600 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{money(s.amount)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, font: '500 12px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>
          {team.adj ? `Includes a ${team.adj > 0 ? '+' : ''}${money(team.adj)} cap adjustment. ` : ''}Taxi squad doesn&apos;t count.
        </div>
      </div>

      {lists.map((l) => (
        <div key={l.label}>
          <SectionHead label={l.label} right="OVER CONTRACT" />
          {l.ids.map((id) => {
            const p = byId.get(id);
            if (!p || p.contractValue === null) return null;
            return row(p, `${p.pos}${p.rank} · ${money(p.salary)} vs $${(p.market ?? 0).toLocaleString('en-US')} market · ${p.years} ${p.years === 1 ? 'yr' : 'yrs'}`,
              signedDollars(p.contractValue), p.contractValue > 0 ? 'var(--rise)' : 'var(--fall)');
          })}
        </div>
      ))}

      <SectionHead label="COMMITTED" right="ROOM" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 28, padding: '0 16px', borderBottom: '1px solid var(--line)', font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 1, background: 'var(--ink-2)' }} />CONTRACTS</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 1, background: 'var(--pos-pick)' }} />DRAFT PICKS</span>
      </div>
      {team.committed.map((y) => {
        const room = cap - y.contracts - y.picks;
        return (
          <div key={y.year} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 72px', alignItems: 'center', gap: 10, height: 48, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ font: DISPLAY(14), letterSpacing: '.04em' }}>{y.year}</span>
            <span role="img" aria-label={`${y.year}: ${money(y.contracts)} in contracts plus ${money(y.picks)} in draft picks, ${money(room)} room`} style={{ display: 'flex', gap: 2, height: 6, background: 'var(--bg-300)', borderRadius: 1 }}>
              <span style={{ width: pct(y.contracts), background: 'var(--ink-2)', borderRadius: 1 }} />
              <span style={{ width: pct(y.picks), background: 'var(--pos-pick)', borderRadius: 1 }} />
            </span>
            <span style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', font: '600 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>{money(y.contracts)}</span>
              {y.picks > 0 && <span style={{ display: 'block', marginTop: 4, font: '500 11px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', color: 'var(--pos-pick)' }}>+{money(y.picks)} picks</span>}
            </span>
            <span style={{ textAlign: 'right', font: '600 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', color: room < 0 ? 'var(--live)' : 'var(--rise)' }}>{money(room)}</span>
          </div>
        );
      })}

      {expiring.length > 0 && (
        <>
          <SectionHead label={`EXPIRING AFTER ${data.season}`} right={money(expiring.reduce((t, p) => t + p.salary, 0))} />
          {expiring.map((p) => row(p, p.team, money(p.salary), 'var(--ink)'))}
        </>
      )}
      <div style={{ height: 20 }} />
    </div>
  );
}
