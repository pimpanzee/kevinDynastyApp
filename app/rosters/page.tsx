'use client';

import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import { Chevron, SectionTitle, StatCell, StickySectionHeader } from '@/components/ListChrome';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { fmtMoney } from '@/lib/mock/derive';
import { FRANCHISES, MY_FRANCHISE_INDEX } from '@/lib/mock/franchises';
import { getAdjustment, getRoster, getTaxi } from '@/lib/mock/roster';
import type { RosterPlayer } from '@/lib/types';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

export default function RostersPage() {
  // Defaults to the user's own franchise on load.
  const [franchiseIdx, setFranchiseIdx] = useState(MY_FRANCHISE_INDEX);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const roster = getRoster(franchiseIdx);
  const taxi = getTaxi(franchiseIdx);
  const adj = getAdjustment(franchiseIdx);
  const total = roster.reduce((s, p) => s + p.salary, 0) + adj;
  const isYou = franchiseIdx === MY_FRANCHISE_INDEX;

  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  /** Switching franchise never leaves the page — it just swaps the data. */
  const selectFranchise = (i: number) => {
    setFranchiseIdx(i);
    setSwitcherOpen(false);
    setOpen({});
  };

  const groups = POSITION_ORDER.map((pos) => ({
    label: pos,
    players: roster.filter((p) => p.pos === pos),
  })).filter((g) => g.players.length > 0);

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <StatusBar label="ROSTERS" />
      <HeaderBar right={<HeaderLabel>ROSTER</HeaderLabel>} />

      <div
        onClick={() => setSwitcherOpen(true)}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setSwitcherOpen(true);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          padding: '8px 14px',
          borderBottom: '2px solid var(--color-text)',
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '800 15px/1.15 var(--font-heading)', letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {FRANCHISES[franchiseIdx]}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-neutral-600)', marginTop: 2 }}>
            {roster.length} PLAYERS
          </div>
        </div>
        {isYou && (
          <span className="tag tag-outline" style={{ fontSize: 8.5, whiteSpace: 'nowrap', flex: 'none' }}>
            YOUR TEAM
          </span>
        )}
        <span style={{ font: '800 11px var(--font-heading)', color: 'var(--color-neutral-600)' }}>▾</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 6 }}>
        {groups.map((group) => (
          <div key={group.label}>
            <StickySectionHeader padding="12px 14px 7px">
              <SectionTitle>{group.label}</SectionTitle>
            </StickySectionHeader>
            {group.players.map((p, i) => {
              const key = `${group.label}-${i}-${p.name}`;
              return <PlayerRow key={key} player={p} open={!!open[key]} onToggle={() => toggle(key)} />;
            })}
          </div>
        ))}

        <StickySectionHeader padding="12px 14px 7px" marginTop={6}>
          <SectionTitle>TAXI SQUAD</SectionTitle>
          <div style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', marginTop: 2 }}>
            {taxi.length} {taxi.length === 1 ? 'PLAYER' : 'PLAYERS'} · not counted toward roster or salary cap
          </div>
        </StickySectionHeader>

        {taxi.map((p, i) => {
          const key = `taxi-${i}-${p.name}`;
          return <PlayerRow key={key} player={p} open={!!open[key]} onToggle={() => toggle(key)} />;
        })}

        <div style={{ height: 4 }} />
      </div>

      <div style={{ borderTop: '2px solid var(--color-text)', padding: '10px 14px 11px', background: 'var(--color-bg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
          <StatCell label="PLAYERS" value={roster.length} valueFont="800 13px var(--font-heading)" />
          <StatCell label="ADJ" value={`${adj >= 0 ? '+' : ''}${fmtMoney(adj)}`} valueFont="800 13px var(--font-heading)" />
          <StatCell label="TOTAL" value={fmtMoney(total)} valueFont="800 13px var(--font-heading)" />
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSwitcherOpen(false);
                }}
                style={{ cursor: 'pointer', font: '800 14px var(--font-heading)' }}
              >
                ×
              </span>
            </div>
            <div className="dialog-body" style={{ padding: 0 }}>
              {FRANCHISES.map((name, i) => (
                <div
                  key={name}
                  onClick={() => selectFranchise(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') selectFranchise(i);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 20px',
                    borderTop: '1px solid var(--color-divider)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 16, flex: 'none', font: '800 12px var(--font-heading)', color: 'var(--color-accent)' }}>
                    {i === franchiseIdx ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, font: '600 13.5px var(--font-body)' }}>{name}</span>
                  {i === MY_FRANCHISE_INDEX && (
                    <span className="tag tag-outline" style={{ fontSize: 8 }}>
                      YOU
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PhoneFrame>
  );
}

/** Roster row: name + salary, chevron expands the ECR/PROJ/MATCHUP/PTS/BYE grid. */
function PlayerRow({
  player,
  open,
  onToggle,
}: {
  player: RosterPlayer;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--color-divider)' }}>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle();
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '600 13.5px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.name}
          </div>
          <div style={{ font: '800 9px var(--font-heading)', letterSpacing: '.07em', color: 'var(--color-neutral-600)', marginTop: 3 }}>
            {player.team} · {player.pos}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ font: '800 14px var(--font-heading)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtMoney(player.salary)}
          </div>
          <div style={{ marginTop: 4, textAlign: 'right' }}>
            <span style={{ font: '700 10px var(--font-body)', color: 'var(--color-neutral-600)' }}>
              {player.years}yr
            </span>
          </div>
        </div>
        <Chevron open={open} />
      </div>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4, padding: '2px 14px 12px', background: 'var(--color-neutral-200)' }}>
          <StatCell label="ECR" value={player.ecr} valueFont="700 11.5px var(--font-body)" />
          <StatCell label="PROJ" value={player.proj} valueFont="700 11.5px var(--font-body)" />
          <div>
            <div style={{ font: '800 8px var(--font-heading)', letterSpacing: '.06em', color: 'var(--color-neutral-600)' }}>
              MATCHUP
            </div>
            <div style={{ marginTop: 2, fontSize: 10, letterSpacing: -1 }}>
              <span style={{ color: 'var(--color-accent-700)' }}>{'★'.repeat(player.matchup)}</span>
              <span style={{ color: 'var(--color-neutral-300)' }}>{'☆'.repeat(5 - player.matchup)}</span>
            </div>
          </div>
          <StatCell label="PTS" value={player.pts} valueFont="700 11.5px var(--font-body)" />
          <StatCell label="BYE" value={player.bye} valueFont="700 11.5px var(--font-body)" />
        </div>
      )}
    </div>
  );
}
