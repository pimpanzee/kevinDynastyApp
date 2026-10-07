'use client';

import { useEffect, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import { Chevron, SectionTitle, StatCell, StickySectionHeader } from '@/components/ListChrome';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { useMyTeam } from '@/lib/myTeam';
import type { RosterPlayerView, RosterView } from '@/lib/types';

export default function RostersScreen({ initial }: { initial: RosterView }) {
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  /**
   * Switching franchise fetches that team's prebuilt roster and swaps the data
   * in place — the page never navigates.
   */
  const selectFranchise = async (id: string) => {
    setSwitcherOpen(false);
    if (id === view.franchiseId) return;
    setLoading(true);
    setError(null);
    setOpen({});
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/roster/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`Roster request failed (${res.status})`);
      setView(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that roster');
    } finally {
      setLoading(false);
    }
  };

  // The page is prebuilt on the league's default team; open on the viewer's own.
  const defaultTeam = initial.franchises.find((f) => f.isMine)?.id ?? initial.franchiseId;
  const team = useMyTeam(defaultTeam);
  useEffect(() => {
    if (team !== initial.franchiseId) selectFranchise(team);
    // Only when the chosen team changes, not on every switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <StatusBar label="ROSTERS" simulatedAt={view.simulatedAt} />
      <HeaderBar right={<HeaderLabel>ROSTER</HeaderLabel>} />

      <div
        onClick={() => setSwitcherOpen(true)}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSwitcherOpen(true); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '8px 14px',
          borderBottom: '2px solid var(--color-text)', cursor: 'pointer',
          opacity: loading ? 0.55 : 1, transition: 'opacity .15s',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '800 15px/1.15 var(--font-heading)', letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {view.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-neutral-600)', marginTop: 2 }}>
            {loading ? 'LOADING…' : `${view.footer.count} PLAYERS`}
          </div>
        </div>
        {view.franchiseId === team && (
          <span className="tag tag-outline" style={{ fontSize: 8.5, whiteSpace: 'nowrap', flex: 'none' }}>YOUR TEAM</span>
        )}
        <span style={{ font: '800 11px var(--font-heading)', color: 'var(--color-neutral-600)' }}>▾</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 6 }}>
        {error && (
          <div style={{ padding: '12px 14px', fontSize: 11.5, color: 'var(--color-accent-700)', borderBottom: '1px solid var(--color-divider)' }}>
            {error}
          </div>
        )}

        {view.groups.map((group) => (
          <div key={group.label}>
            <StickySectionHeader padding="12px 14px 7px">
              <SectionTitle>{group.label}</SectionTitle>
            </StickySectionHeader>
            {group.players.map((p, i) => {
              const key = `${group.label}-${i}-${p.playerId}`;
              return <PlayerRow key={key} player={p} open={!!open[key]} onToggle={() => toggle(key)} />;
            })}
          </div>
        ))}

        {view.taxi.length > 0 && (
          <>
            <StickySectionHeader padding="12px 14px 7px" marginTop={6}>
              <SectionTitle>TAXI SQUAD</SectionTitle>
              <div style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', marginTop: 2 }}>
                {view.taxi.length} {view.taxi.length === 1 ? 'PLAYER' : 'PLAYERS'} · not counted toward roster or salary cap
              </div>
            </StickySectionHeader>
            {view.taxi.map((p, i) => {
              const key = `taxi-${i}-${p.playerId}`;
              return <PlayerRow key={key} player={p} open={!!open[key]} onToggle={() => toggle(key)} />;
            })}
          </>
        )}

        <div style={{ height: 4 }} />
      </div>

      <div style={{ borderTop: '2px solid var(--color-text)', padding: '10px 14px 11px', background: 'var(--color-bg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
          <StatCell label="PLAYERS" value={view.footer.count} valueFont="800 13px var(--font-heading)" />
          <StatCell label="ADJ" value={view.footer.adj} valueFont="800 13px var(--font-heading)" />
          <StatCell label="TOTAL" value={view.footer.total} valueFont="800 13px var(--font-heading)" />
        </div>
      </div>

      <BottomNav />

      {switcherOpen && (
        <div
          className="dialog-backdrop"
          onClick={() => setSwitcherOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-label="Switch franchise"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxHeight: '80%', overflow: 'auto', borderRadius: 0 }}
          >
            <div className="dialog-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>SWITCH FRANCHISE</span>
              <span
                onClick={() => setSwitcherOpen(false)}
                role="button"
                tabIndex={0}
                aria-label="Close"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSwitcherOpen(false); }}
                style={{ cursor: 'pointer', font: '800 14px var(--font-heading)' }}
              >
                ×
              </span>
            </div>
            <div className="dialog-body" style={{ padding: 0 }}>
              {view.franchises.map((f) => (
                <div
                  key={f.id}
                  onClick={() => selectFranchise(f.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectFranchise(f.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
                    borderTop: '1px solid var(--color-divider)', cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 16, flex: 'none', font: '800 12px var(--font-heading)', color: 'var(--color-accent)' }}>
                    {f.id === view.franchiseId ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, font: '600 13.5px var(--font-body)' }}>{f.name}</span>
                  {f.id === team && <span className="tag tag-outline" style={{ fontSize: 8 }}>YOU</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PhoneFrame>
  );
}

/**
 * Roster row. The expand grid carries PROJ and PTS only — the design's ECR,
 * MATCHUP star rating and BYE have no MFL source and were dropped rather than
 * filled with invented numbers.
 */
function PlayerRow({
  player, open, onToggle,
}: {
  player: RosterPlayerView; open: boolean; onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--color-divider)' }}>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '600 13.5px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.name}
          </div>
          <div style={{ font: '800 9px var(--font-heading)', letterSpacing: '.07em', color: 'var(--color-neutral-600)', marginTop: 3 }}>
            {player.teamPos}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ font: '800 14px var(--font-heading)', fontVariantNumeric: 'tabular-nums' }}>{player.salaryFmt}</div>
          <div style={{ marginTop: 4, textAlign: 'right' }}>
            <span style={{ font: '700 10px var(--font-body)', color: 'var(--color-neutral-600)' }}>{player.yearsLabel}</span>
          </div>
        </div>
        <Chevron open={open} />
      </div>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 4, padding: '2px 14px 12px', background: 'var(--color-neutral-200)' }}>
          <StatCell label="PROJ" value={player.proj} valueFont="700 11.5px var(--font-body)" />
          <StatCell label="PTS" value={player.pts} valueFont="700 11.5px var(--font-body)" />
        </div>
      )}
    </div>
  );
}
