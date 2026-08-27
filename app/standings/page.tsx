'use client';

import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import { Chevron, SectionTitle, StatCell, StickySectionHeader } from '@/components/ListChrome';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { STANDINGS } from '@/lib/mock/standings';

export default function StandingsPage() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  return (
    <PhoneFrame>
      <StatusBar label="SUN 1:07 ET" />
      <HeaderBar right={<HeaderLabel>STANDINGS</HeaderLabel>} />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        {STANDINGS.map((group, gi) => (
          <div key={group.label}>
            <StickySectionHeader padding="14px 14px 8px">
              <SectionTitle tracking=".1em">{group.label}</SectionTitle>
            </StickySectionHeader>

            {group.teams.map((t, ti) => {
              const key = `${gi}-${ti}`;
              const isOpen = !!open[key];
              return (
                <div key={t.name} style={{ borderBottom: '1px solid var(--color-divider)' }}>
                  <div
                    onClick={() => toggle(key)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') toggle(key);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 0', cursor: 'pointer' }}
                  >
                    {/* Rank is position within the division, as designed. */}
                    <span style={{ width: 16, flex: 'none', font: '800 11px var(--font-heading)', color: 'var(--color-neutral-600)', textAlign: 'right' }}>
                      {ti + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.name}
                      </div>
                    </div>
                    <div style={{ font: '800 13px var(--font-heading)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                      {t.record}
                    </div>
                    <Chevron open={isOpen} size={9} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4, padding: '9px 14px 12px 58px' }}>
                    <StatCell label="PF" labelSize={8.5} value={t.pf} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="PA" labelSize={8.5} value={t.pa} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="DIV" labelSize={8.5} value={t.div} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="CONF" labelSize={8.5} value={t.conf} valueFont="800 12px var(--font-heading)" />
                    <StatCell label="PP" labelSize={8.5} value={t.pp} valueFont="800 12px var(--font-heading)" accent />
                  </div>

                  {isOpen && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5,1fr)',
                        gap: 4,
                        borderTop: '1px solid var(--color-divider)',
                        margin: '0 14px 0 58px',
                        padding: '9px 0 13px',
                        color: 'var(--color-neutral-700)',
                      }}
                    >
                      <StatCell label="PCT" labelSize={8.5} value={t.pct} valueFont="600 11.5px var(--font-body)" />
                      <StatCell label="GB" labelSize={8.5} value={t.gb} valueFont="600 11.5px var(--font-body)" />
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

        <div style={{ height: 8 }} />
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}
