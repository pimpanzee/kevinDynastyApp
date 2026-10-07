'use client';

import { useRef, useState, type CSSProperties } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import { SectionTitle, StickySectionHeader } from '@/components/ListChrome';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { useMyTeam } from '@/lib/myTeam';
import type { StandingsTeamView, StandingsView } from '@/lib/types';

/**
 * One table per division. The team column stays put while the stats scroll
 * sideways — inside the table, not the page — and every division scrolls
 * together so their columns stay lined up.
 */

interface Column {
  label: string;
  value: (t: StandingsTeamView) => string;
  width: number;
  strong?: boolean;
  accent?: boolean;
}

const TEAM_W = 156;
const ROW_H = 50;

function columns(hasVp: boolean): Column[] {
  return [
    ...(hasVp ? [{ label: 'VP', value: (t: StandingsTeamView) => String(t.vp ?? '—'), width: 38, strong: true }] : []),
    { label: 'W-L-T', value: (t) => t.record, width: 56, strong: !hasVp },
    { label: 'PCT', value: (t) => t.pct, width: 48 },
    { label: 'STRK', value: (t) => t.streak, width: 44 },
    { label: 'PF', value: (t) => t.pf, width: 58 },
    { label: 'PA', value: (t) => t.pa, width: 58 },
    { label: 'PP', value: (t) => t.pp, width: 58, accent: true },
    hasVp
      ? { label: 'VP BACK', value: (t) => t.vpBack, width: 56 }
      : { label: 'GB', value: (t) => t.gb, width: 44 },
    { label: 'DIV', value: (t) => t.div, width: 52 },
    { label: 'CONF', value: (t) => t.conf, width: 52 },
    { label: 'AVG PF', value: (t) => t.avgPf, width: 56 },
    { label: 'AVG PA', value: (t) => t.avgPa, width: 60 },
  ];
}

const headCell: CSSProperties = {
  font: '800 9px var(--font-heading)',
  letterSpacing: '.08em',
  color: 'var(--color-neutral-600)',
  padding: '8px 6px 7px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--color-neutral-300)',
};

export default function StandingsScreen({ view }: { view: StandingsView }) {
  const myTeam = useMyTeam(view.myFranchiseId);
  const hasVp = view.groups.some((g) => g.teams.some((t) => t.vp !== null));
  const cols = columns(hasVp);

  // Keep every division's table at the same horizontal offset.
  const scrollers = useRef<Array<HTMLDivElement | null>>([]);
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (from: HTMLDivElement) => {
    for (const el of scrollers.current) {
      if (el && el !== from && el.scrollLeft !== from.scrollLeft) el.scrollLeft = from.scrollLeft;
    }
    setScrolled(from.scrollLeft > 0);
  };

  // The frozen column casts a shadow once stats slide under it.
  const frozen = (bg: string): CSSProperties => ({
    position: 'sticky',
    left: 0,
    zIndex: 1,
    background: bg,
    boxShadow: scrolled ? '6px 0 8px -6px rgba(0,0,0,.28)' : 'inset -1px 0 0 var(--color-divider)',
    transition: 'box-shadow .15s',
  });

  return (
    <PhoneFrame>
      <StatusBar label="STANDINGS" simulatedAt={view.simulatedAt} />
      <HeaderBar right={<HeaderLabel>STANDINGS</HeaderLabel>} />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {view.groups.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: 6 }}>
            <StickySectionHeader padding="14px 14px 8px">
              <SectionTitle tracking=".1em">{group.label}</SectionTitle>
            </StickySectionHeader>

            <div
              ref={(el) => { scrollers.current[gi] = el; }}
              onScroll={(e) => onScroll(e.currentTarget)}
              style={{ overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'none' }}
            >
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...headCell, ...frozen('var(--color-bg)'), width: TEAM_W, minWidth: TEAM_W, maxWidth: TEAM_W, textAlign: 'left', paddingLeft: 14 }}>
                      TEAM
                    </th>
                    {cols.map((c) => (
                      <th key={c.label} style={{ ...headCell, minWidth: c.width, color: c.accent ? 'var(--color-accent-700)' : headCell.color }}>
                        {c.label}
                      </th>
                    ))}
                    <th aria-hidden style={{ ...headCell, width: '100%', padding: 0 }} />
                  </tr>
                </thead>
                <tbody>
                  {group.teams.map((t) => {
                    const mine = t.franchiseId === myTeam;
                    const bg = mine ? 'color-mix(in srgb, var(--color-accent) 7%, var(--color-bg))' : 'var(--color-bg)';
                    const cell: CSSProperties = { borderBottom: '1px solid var(--color-divider)', background: bg };
                    return (
                      <tr key={t.franchiseId} aria-current={mine ? 'true' : undefined}>
                        <th scope="row" style={{ ...cell, ...frozen(bg), padding: 0, width: TEAM_W, minWidth: TEAM_W, maxWidth: TEAM_W, textAlign: 'left', fontWeight: 'normal' }}>
                          <TeamCell team={t} mine={mine} />
                        </th>
                        {cols.map((c) => (
                          <td
                            key={c.label}
                            style={{
                              ...cell,
                              padding: '0 6px',
                              height: ROW_H,
                              textAlign: 'right',
                              whiteSpace: 'nowrap',
                              fontVariantNumeric: 'tabular-nums',
                              font: c.strong ? '800 13px var(--font-heading)' : '500 12.5px var(--font-body)',
                              color: c.accent ? 'var(--color-accent-700)' : c.strong ? 'var(--color-text)' : 'var(--color-neutral-800)',
                            }}
                          >
                            {c.value(t)}
                          </td>
                        ))}
                        <td aria-hidden style={{ ...cell, paddingRight: 8 }} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}

/**
 * Logo at the left edge fading into the row, with the name over its faded
 * end on balanced lines (a third for long names). Row order gives the division rank.
 */
function TeamCell({ team, mine }: { team: StandingsTeamView; mine: boolean }) {
  const [failed, setFailed] = useState(false);
  const long = team.name.length > 22;
  const fade = 'linear-gradient(to right, #000 15%, transparent 88%)';
  return (
    <div style={{ position: 'relative', height: ROW_H, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
      {team.icon && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote, unknown-size owner images in a static export
        <img
          src={team.icon}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%', aspectRatio: '1', objectFit: 'cover',
            opacity: 0.45, maskImage: fade, WebkitMaskImage: fade,
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            position: 'absolute', left: 8, font: '800 18px var(--font-heading)', color: 'var(--color-neutral-300)',
          }}
        >
          {initials(team.name)}
        </span>
      )}
      {mine && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--color-accent)' }} />}
      <span
        style={{
          position: 'relative',
          margin: '0 8px 0 40px',
          // Long names step down a size and get a third line, so they show whole.
          font: `${mine ? 800 : 700} ${long ? '11px/1.15' : '12.5px/1.2'} var(--font-body)`,
          color: 'var(--color-text)',
          textWrap: 'balance',
          display: '-webkit-box',
          WebkitLineClamp: long ? 3 : 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textShadow: '0 0 6px var(--color-bg), 0 0 2px var(--color-bg)',
        }}
      >
        {team.name}
      </span>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
