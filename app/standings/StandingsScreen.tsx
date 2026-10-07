'use client';

import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import { Chevron, SectionTitle, StatCell, StickySectionHeader } from '@/components/ListChrome';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import TeamAvatar from '@/components/TeamAvatar';
import type { StandingsView } from '@/lib/types';

export default function StandingsScreen({ view }: { view: StandingsView }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  return (
    <PhoneFrame>
      <StatusBar label="STANDINGS" simulatedAt={view.simulatedAt} />
      <HeaderBar right={<HeaderLabel>STANDINGS</HeaderLabel>} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {view.groups.map((group, gi) => (
          <div key={group.label}>
            <StickySectionHeader padding="14px 14px 8px">
              <SectionTitle tracking=".1em">{group.label}</SectionTitle>
            </StickySectionHeader>

            {group.teams.map((t, ti) => {
              const key = `${gi}-${ti}`;
              const isOpen = !!open[key];
              return (
                <div key={t.franchiseId} style={{ borderBottom: '1px solid var(--color-divider)' }}>
                  <div
                    onClick={() => toggle(key)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(key); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 0', cursor: 'pointer' }}
                  >
                    {/* Rank is position within the division, as designed. */}
                    <span style={{ width: 12, flex: 'none', font: '800 11px var(--font-heading)', color: 'var(--color-neutral-600)', textAlign: 'right' }}>
                      {t.rank}
                    </span>
                    <TeamAvatar name={t.name} icon={t.icon} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.name}
                      </div>
                    </div>
                    {t.vp !== null ? (
                      <div style={{ flex: 'none', textAlign: 'right' }}>
                        <div style={{ font: '800 13px var(--font-heading)', fontVariantNumeric: 'tabular-nums' }}>
                          {t.vp} <span style={{ font: '800 9px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-neutral-600)' }}>VP</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{t.record}</div>
                      </div>
                    ) : (
                      <div style={{ font: '800 13px var(--font-heading)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{t.record}</div>
                    )}
                    <Chevron open={isOpen} size={9} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4, padding: '9px 14px 12px 70px' }}>
                    <StatCell label="PF" labelSize={8.5} value={t.pf} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="PA" labelSize={8.5} value={t.pa} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="DIV" labelSize={8.5} value={t.div} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="CONF" labelSize={8.5} value={t.conf} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="PP" labelSize={8.5} value={t.pp} valueFont="800 12px var(--font-heading)" accent />
                  </div>

                  {isOpen && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4,
                      borderTop: '1px solid var(--color-divider)', margin: '0 14px 0 70px',
                      padding: '9px 0 13px', color: 'var(--color-neutral-700)',
                    }}>
                      <StatCell label="PCT" labelSize={8.5} value={t.pct} valueFont="600 11.5px var(--font-body)" />
                      {t.vp !== null
                        ? <StatCell label="VP BACK" labelSize={8.5} value={t.vpBack} valueFont="600 11.5px var(--font-body)" />
                        : <StatCell label="GB" labelSize={8.5} value={t.gb} valueFont="600 11.5px var(--font-body)" />}
                      <StatCell label="STRK" labelSize={8.5} value={t.streak} valueFont="600 11.5px var(--font-body)" />
                      <StatCell label="AVG PF" labelSize={8.5} value={t.avgPf} valueFont="600 11.5px var(--font-body)" />
                      <StatCell label="AVG PA" labelSize={8.5} value={t.avgPa} valueFont="600 11.5px var(--font-body)" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      </div>

      <BottomNav />
    </PhoneFrame>
  );
}
