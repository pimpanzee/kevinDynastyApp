'use client';

import { useRef, useState } from 'react';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';

const STEPS = [
  'Install Scriptable (free) from the App Store.',
  'Tap Copy script below.',
  'In Scriptable, tap +, paste, and name the script GRIDLOCK. Tap ▶ to preview.',
  'Long-press your Home Screen → + → Scriptable, pick a size and add it.',
  'Long-press the widget → Edit Widget → Script: GRIDLOCK.',
  'Optional: set Parameter to your team name (e.g. Tuna) to follow another team.',
];

export default function WidgetSetupScreen({ script }: { script: string }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
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
      <HeaderBar right={<HeaderLabel>WIDGET</HeaderLabel>} />
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
