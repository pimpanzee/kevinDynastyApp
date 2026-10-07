'use client';

import { useRef, useState } from 'react';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { useMyTeam } from '@/lib/myTeam';

const STEPS = [
  'Install Scriptable (free) from the App Store.',
  'Tap Copy script below.',
  'In Scriptable, tap +, paste, and name the script GRIDLOCK. Tap ▶ to preview.',
  'Long-press your Home Screen → + → Scriptable, pick a size and add it.',
  'Long-press the widget → Edit Widget → Script: GRIDLOCK.',
  'Still in Edit Widget, set Parameter to your team’s id, shown below, so the widget follows your team.',
  'Lock Screen: long-press the Lock Screen → Customize → Lock Screen → tap the widget area (or the line above the clock) → Scriptable, then tap the added widget and choose Script: GRIDLOCK.',
];

export default function WidgetSetupScreen({
  script, franchises, defaultTeam,
}: {
  script: string;
  franchises: Array<{ id: string; name: string }>;
  defaultTeam: string;
}) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [paramCopied, setParamCopied] = useState(false);
  const team = useMyTeam(defaultTeam);
  const teamName = franchises.find((f) => f.id === team)?.name ?? team;

  const copyParam = async () => {
    try {
      await navigator.clipboard.writeText(team);
      setParamCopied(true);
    } catch {
      setParamCopied(false);
    }
  };
  const area = useRef<HTMLTextAreaElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied('done');
    } catch {
      // Older iOS or a blocked clipboard: select the text and use the legacy path.
      const el = area.current;
      if (el) {
        el.focus();
        el.setSelectionRange(0, script.length);
        setCopied(document.execCommand('copy') ? 'done' : 'failed');
      } else {
        setCopied('failed');
      }
    }
  };

  return (
    <PhoneFrame>
      <StatusBar label="WIDGET" />
      <HeaderBar back="/settings/" right={<HeaderLabel>WIDGET</HeaderLabel>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 14px 24px' }}>
        <div style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)' }}>
          HOME SCREEN WIDGET
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.45 }}>
          Live matchup score, win odds, and the latest touchdowns and big plays, on your Home Screen or Lock Screen.
        </p>

        <ol style={{ margin: '14px 0 0', paddingLeft: 20, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-800)' }}>
          {STEPS.map((s) => (
            <li key={s} style={{ marginBottom: 6 }}>{s}</li>
          ))}
        </ol>

        <button
          onClick={copy}
          style={{
            marginTop: 14, width: '100%', height: 48, border: 0, cursor: 'pointer',
            background: copied === 'done' ? 'var(--color-text)' : 'var(--color-accent)', color: 'var(--color-bg)',
            font: '800 13px var(--font-heading)', letterSpacing: '.08em',
          }}
        >
          {copied === 'done' ? 'COPIED — NOW PASTE IN SCRIPTABLE' : 'COPY SCRIPT'}
        </button>
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--color-neutral-200)', borderLeft: '3px solid var(--color-accent)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '800 9.5px var(--font-heading)', letterSpacing: '.12em', color: 'var(--color-neutral-600)' }}>YOUR WIDGET PARAMETER</div>
            <div style={{ marginTop: 3, fontSize: 13 }}>
              <strong style={{ font: '800 15px var(--font-heading)', letterSpacing: '.04em' }}>{team}</strong>
              <span style={{ color: 'var(--color-neutral-700)' }}> · {teamName}</span>
            </div>
            <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--color-neutral-600)' }}>Change your team in Settings.</div>
          </div>
          <button
            onClick={copyParam}
            style={{ flex: 'none', height: 32, padding: '0 12px', border: '1px solid var(--color-text)', background: 'none', cursor: 'pointer', font: '800 10.5px var(--font-heading)', letterSpacing: '.06em', color: 'var(--color-text)' }}
          >
            {paramCopied ? 'COPIED' : 'COPY'}
          </button>
        </div>

        {copied === 'failed' && (
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--color-accent-700)' }}>
            Couldn&apos;t copy automatically. Tap in the box below, choose Select All, then Copy.
          </p>
        )}

        <textarea
          ref={area}
          readOnly
          value={script}
          aria-label="Widget script"
          style={{
            marginTop: 12, width: '100%', height: 220, resize: 'none',
            font: '400 10px/1.4 ui-monospace, Menlo, monospace', color: 'var(--color-neutral-700)',
            background: 'var(--color-neutral-200)', border: '1px solid var(--color-divider)', padding: 8,
          }}
        />
      </div>
    </PhoneFrame>
  );
}
