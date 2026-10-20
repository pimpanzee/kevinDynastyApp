'use client';

import { useEffect, useMemo, useState } from 'react';
import TeamAvatar from '@/components/TeamAvatar';
import LeagueFrame from '@/components/league/LeagueFrame';
import TeamLink from '@/components/league/TeamLink';
import SectionHead from '@/components/team/SectionHead';
import { DISPLAY } from '@/components/team/format';
import { useMyTeam } from '@/lib/myTeam';
import { useHistory } from '@/lib/useHistory';

/**
 * League › Recap: the week's AI-written recap (relay GET /recap), newest
 * first, with a chip per week that has one. Scores come from the league
 * history; the words are the recap's own.
 */

const RELAY = (process.env.NEXT_PUBLIC_LIVE_URL ?? '').replace(/\/$/, '');
const SEASON = Number(process.env.NEXT_PUBLIC_SEASON ?? new Date().getFullYear());

interface Recap {
  season: number;
  week: number;
  writtenAt: number;
  weeks: number[];
  recap: {
    headline: string;
    intro: string;
    matchups: Array<{ winner: string; loser: string; text: string }>;
    storylines: Array<{ title: string; text: string }>;
    nextWeek: string;
  };
}

type Team = { id: string; name: string; icon: string | null };

export default function RecapScreen({ franchises, myFranchiseId }: { franchises: Team[]; myFranchiseId: string }) {
  const mine = useMyTeam(myFranchiseId);
  const history = useHistory();
  const [week, setWeek] = useState<number | null>(null);
  const [data, setData] = useState<Recap | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');

  useEffect(() => {
    if (!RELAY) return setState('none');
    let live = true;
    setState('loading');
    fetch(`${RELAY}/recap${week ? `?week=${week}` : ''}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!live) return;
        if (r.ok && body?.recap) {
          setData(body);
          setState('ready');
        } else setState(r.status === 404 ? 'none' : 'error');
      })
      .catch(() => live && setState('error'));
    return () => {
      live = false;
    };
  }, [week]);

  const byName = useMemo(() => new Map(franchises.map((f) => [f.name, f])), [franchises]);
  /** This week's score for a team, from the stored history. */
  const score = useMemo(() => {
    const m = new Map<string, number>();
    for (const [s, w, home, hs, away, as] of history?.games ?? []) {
      if (s === data?.season && w === data?.week) {
        m.set(home, hs);
        m.set(away, as);
      }
    }
    return (id?: string) => (id && m.has(id) ? m.get(id)!.toFixed(1) : '');
  }, [history, data]);

  return (
    <LeagueFrame>
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-100)', paddingBottom: 24 }}>
        {data && data.weeks.length > 1 && (
          <div role="tablist" aria-label="Recap week" style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '1px solid var(--line)' }}>
            {[...data.weeks].reverse().map((w) => {
              const on = w === data.week;
              return (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setWeek(w)}
                  style={{
                    flex: 'none', height: 28, padding: '0 12px', borderRadius: 2, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--volt)' : 'var(--edge)'}`,
                    background: on ? 'var(--volt)' : 'transparent', color: on ? 'var(--on-volt)' : 'var(--ink-2)',
                    font: DISPLAY(12), letterSpacing: '.1em',
                  }}
                >
                  WK {w}
                </button>
              );
            })}
          </div>
        )}

        {state === 'loading' && !data && <Note>Loading the recap…</Note>}
        {state === 'none' && <Note>No recap yet. It lands every Tuesday morning after the week ends.</Note>}
        {state === 'error' && <Note>Couldn&apos;t load the recap. Pull to refresh or try again later.</Note>}

        {data && (
          <article style={{ opacity: state === 'loading' ? 0.5 : 1, transition: 'opacity .15s' }}>
            <header style={{ padding: '18px 16px 16px', borderBottom: '1px solid var(--edge)', background: 'linear-gradient(180deg, var(--bg-200), var(--bg-100))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: DISPLAY(11), letterSpacing: '.14em', color: 'var(--ink-3)' }}>
                <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
                WEEK {data.week} RECAP · {data.season}
              </div>
              <h1 style={{ margin: '10px 0 0', font: DISPLAY(26, 800), lineHeight: 1.08, letterSpacing: '.01em', textTransform: 'uppercase', textWrap: 'balance' }}>
                {data.recap.headline}
              </h1>
              {data.recap.intro && (
                <p style={{ margin: '10px 0 0', font: '500 15px/1.45 var(--font-body)', color: 'var(--ink-2)' }}>{data.recap.intro}</p>
              )}
            </header>

            <SectionHead label="THE GAMES" right={`${data.recap.matchups.length}`} />
            {data.recap.matchups.map((m, i) => {
              const w = byName.get(m.winner);
              const l = byName.get(m.loser);
              const meIn = w?.id === mine || l?.id === mine;
              return (
                <section key={i} style={{ padding: '12px 16px 14px', borderBottom: '1px solid var(--line)', background: meIn ? 'var(--bg-200)' : undefined, boxShadow: meIn ? 'inset 3px 0 0 var(--volt)' : undefined }}>
                  <Side team={w} name={m.winner} pts={score(w?.id)} won mine={mine} />
                  <Side team={l} name={m.loser} pts={score(l?.id)} won={false} mine={mine} />
                  <p style={{ margin: '8px 0 0', font: '400 14px/1.45 var(--font-body)', color: 'var(--ink)' }}>{m.text}</p>
                </section>
              );
            })}

            {data.recap.storylines.length > 0 && (
              <>
                <SectionHead label="STORYLINES" />
                <div style={{ padding: '10px 16px 4px', display: 'grid', gap: 10 }}>
                  {data.recap.storylines.map((s, i) => (
                    <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-200)', borderLeft: '3px solid var(--volt)', borderRadius: 2 }}>
                      <div style={{ font: DISPLAY(14), letterSpacing: '.04em', textTransform: 'uppercase' }}>{s.title}</div>
                      <p style={{ margin: '6px 0 0', font: '400 14px/1.45 var(--font-body)', color: 'var(--ink-2)' }}>{s.text}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {data.recap.nextWeek && (
              <>
                <SectionHead label={`UP NEXT · WEEK ${data.week + 1}`} />
                <p style={{ margin: 0, padding: '10px 16px', font: '400 14px/1.45 var(--font-body)', color: 'var(--ink-2)' }}>{data.recap.nextWeek}</p>
              </>
            )}

            <p style={{ margin: '12px 16px 0', font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
              WRITTEN BY CLAUDE FROM THE LEAGUE&apos;S RESULTS
            </p>
          </article>
        )}
      </div>
    </LeagueFrame>
  );
}

function Side({ team, name, pts, won, mine }: { team?: Team; name: string; pts: string; won: boolean; mine: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, color: won ? 'var(--ink)' : 'var(--ink-3)' }}>
      <TeamLink id={team?.id} mine={mine}>
        <TeamAvatar name={name} icon={team?.icon ?? null} size={24} mine={team?.id === mine} />
      </TeamLink>
      <TeamLink id={team?.id} mine={mine} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: `${won ? 700 : 500} 14px/1.2 var(--font-body)` }}>
        {name}
      </TeamLink>
      <span style={{ font: DISPLAY(18, won ? 800 : 600), fontVariantNumeric: 'tabular-nums', color: won ? 'var(--ink)' : 'var(--ink-3)' }}>{pts}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, padding: '28px 16px', font: '500 14px/1.45 var(--font-body)', color: 'var(--ink-3)', textAlign: 'center' }}>{children}</p>;
}
