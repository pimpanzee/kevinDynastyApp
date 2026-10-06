// GRIDLOCK — Home Screen widget for Scriptable (https://scriptable.app).
// Your live matchup score, win odds, and the latest touchdowns and big plays
// by players in it. Setup: widget/README.md.
//
// Widget Parameter (long-press the widget → Edit Widget → Parameter):
//   leave blank for the league's default team, or enter a franchise id
//   ("0005") or part of a team name ("Tuna").

const RELAY = 'https://gridlock-live.flynnliam3.workers.dev';
const SITE = 'https://pimpanzee.github.io/kevinDynastyApp';

const C = {
  bg: Color.dynamic(new Color('#f3f2f2'), new Color('#1b1a19')),
  text: Color.dynamic(new Color('#201e1d'), new Color('#f3f2f2')),
  muted: Color.dynamic(new Color('#7d7979'), new Color('#9b9797')),
  faint: Color.dynamic(new Color('#d7d3d3'), new Color('#3a3837')),
  accent: new Color('#ec3013'),
};

const fm = FileManager.local();
const cacheFile = (name) => fm.joinPath(fm.cacheDirectory(), `gridlock-${name}`);

async function franchiseParam() {
  const raw = (args.widgetParameter || '').trim();
  if (!raw || /^\d{4}$/.test(raw)) return raw;
  try {
    const ctx = await new Request(`${SITE}/widget.json`).loadJSON();
    const hit = Object.entries(ctx.franchises).find(([, f]) => f.name.toLowerCase().includes(raw.toLowerCase()));
    return hit ? hit[0] : '';
  } catch {
    return '';
  }
}

/** The relay's feed, falling back to the last good copy when offline. */
async function loadData(franchise) {
  const file = cacheFile(`data-${franchise || 'default'}.json`);
  try {
    const req = new Request(`${RELAY}/widget?franchise=${franchise}`);
    req.timeoutInterval = 20;
    const data = await req.loadJSON();
    if (data.error) throw new Error(data.error);
    fm.writeString(file, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(file)) return { ...JSON.parse(fm.readString(file)), offline: true };
    throw e;
  }
}

/** Franchise icons, cached on the device so a refresh doesn't re-download them. */
async function loadIcon(url) {
  if (!url) return null;
  const file = cacheFile(`icon-${url.replace(/[^a-z0-9]/gi, '').slice(-60)}`);
  try {
    if (fm.fileExists(file)) return fm.readImage(file);
    const img = await new Request(url).loadImage();
    fm.writeImage(file, img);
    return img;
  } catch {
    return null;
  }
}

const fmt = (n) => (n == null ? '—' : n.toFixed(1));

function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function text(stack, str, font, color, opts = {}) {
  const t = stack.addText(str);
  t.font = font;
  t.textColor = color;
  t.lineLimit = opts.lines ?? 1;
  if (opts.scale) t.minimumScaleFactor = opts.scale;
  return t;
}

/** Thin win-probability bar: my share in ink, the rest faint. */
function winBar(width, pct) {
  const dc = new DrawContext();
  dc.size = new Size(width, 4);
  dc.opaque = false;
  dc.respectScreenScale = true;
  dc.setFillColor(C.faint);
  dc.fillRect(new Rect(0, 0, width, 4));
  dc.setFillColor(C.text);
  dc.fillRect(new Rect(0, 0, Math.round((width * pct) / 100), 4));
  return dc.getImage();
}

function header(w, data) {
  const row = w.addStack();
  row.centerAlignContent();
  const live = data.state === 'live';
  if (live) {
    text(row, '● ', Font.heavySystemFont(9), C.accent);
  }
  const state = data.state === 'final' ? 'FINAL' : live ? 'LIVE' : 'UPCOMING';
  text(row, `WK ${data.week} · ${state}`, Font.heavySystemFont(9), live ? C.accent : C.muted);
  row.addSpacer();
  const stamp = data.offline ? 'offline' : data.updatedAt ? ago(data.updatedAt) : '';
  if (stamp) text(row, stamp, Font.mediumSystemFont(9), C.muted);
}

async function teamRow(w, side, data, opts) {
  const row = w.addStack();
  row.centerAlignContent();
  const icon = await loadIcon(side.icon);
  if (icon) {
    const img = row.addImage(icon);
    img.imageSize = new Size(opts.icon, opts.icon);
    img.cornerRadius = opts.icon / 2;
    row.addSpacer(6);
  }
  const mine = side === data.me;
  text(row, side.name, Font.semiboldSystemFont(opts.name), mine ? C.text : C.muted, { scale: 0.7 });
  row.addSpacer();
  const pre = data.state === 'pre';
  const col = row.addStack();
  col.layoutVertically();
  const big = pre ? '—' : fmt(side.score);
  const bigText = text(col, big, Font.heavyMonospacedSystemFont(opts.score), mine ? C.text : C.muted);
  bigText.rightAlignText();
  if (opts.proj && data.state !== 'final' && side.projected) {
    const p = text(col, `proj ${fmt(side.projectedFinal || side.projected)}`, Font.regularSystemFont(9), C.muted);
    p.rightAlignText();
  }
}

function winRow(w, data, width) {
  if (data.state === 'final') {
    const won = data.me.score >= data.opp.score;
    text(w, won ? 'WON' : 'LOST', Font.heavySystemFont(9), won ? C.text : C.muted);
    return;
  }
  const row = w.addStack();
  row.centerAlignContent();
  row.addImage(winBar(width - 40, data.winPct));
  row.addSpacer();
  text(row, `${data.winPct}%`, Font.heavyMonospacedSystemFont(9), C.muted);
}

function playRow(w, play, opts) {
  const row = w.addStack();
  row.centerAlignContent();
  // Side marker: accent for your players, grey for your opponent's.
  const mark = row.addStack();
  mark.size = new Size(3, opts.size + 4);
  mark.backgroundColor = play.side === 'me' ? C.accent : C.faint;
  mark.cornerRadius = 1.5;
  row.addSpacer(5);
  if (play.td) {
    const badge = row.addStack();
    badge.backgroundColor = play.side === 'me' ? C.accent : C.muted;
    badge.cornerRadius = 3;
    badge.setPadding(1, 3, 1, 3);
    text(badge, 'TD', Font.heavySystemFont(opts.size - 2), Color.white());
    row.addSpacer(4);
  }
  text(row, play.name, Font.boldSystemFont(opts.size), C.text);
  row.addSpacer(4);
  text(row, play.label.replace(/\bTD\s/, ''), Font.regularSystemFont(opts.size), C.muted, { scale: 0.75 });
  row.addSpacer();
  if (opts.time) text(row, ago(play.at), Font.mediumSystemFont(opts.size - 1), C.muted);
}

function noPlays(w, data, size) {
  const msg = data.state === 'pre' ? 'Key plays appear here once games kick off.' : 'No touchdowns or big plays yet.';
  text(w, msg, Font.regularSystemFont(size), C.muted, { lines: 2 });
}

async function build(data, family) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = data.url;
  const refreshMin = data.state === 'live' ? 5 : data.state === 'pre' ? 30 : 120;
  w.refreshAfterDate = new Date(Date.now() + refreshMin * 60000);

  // Lock Screen widgets are drawn in one tint by iOS, so they use plain white.
  if (family === 'accessoryInline') {
    // iOS shows a single line of text above the clock.
    const pre = data.state === 'pre';
    const score = `${fmt(pre ? data.me.projected : data.me.score)}–${fmt(pre ? data.opp.projected : data.opp.score)}`;
    const tail = data.state === 'final' ? (data.me.score >= data.opp.score ? 'W' : 'L') : `${data.winPct}%`;
    text(w, `🏈 ${pre ? 'proj ' : ''}${score} · ${tail}`, Font.semiboldSystemFont(12), Color.white());
    return w;
  }

  if (family === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const final = data.state === 'final';
    const top = w.addStack();
    top.addSpacer();
    text(top, final ? (data.me.score >= data.opp.score ? 'W' : 'L') : `${data.winPct}%`, Font.heavyRoundedSystemFont(final ? 22 : 17), Color.white());
    top.addSpacer();
    const bottom = w.addStack();
    bottom.addSpacer();
    text(bottom, final ? fmt(data.me.score) : data.state === 'pre' ? 'PROJ' : 'WIN', Font.semiboldSystemFont(9), Color.white());
    bottom.addSpacer();
    return w;
  }

  if (family === 'accessoryRectangular') {
    const pre = data.state === 'pre';
    text(w, `${pre ? 'proj ' : ''}${fmt(pre ? data.me.projected : data.me.score)} – ${fmt(pre ? data.opp.projected : data.opp.score)}`, Font.heavyMonospacedSystemFont(14), Color.white());
    text(w, data.state === 'final' ? 'FINAL' : `${data.winPct}% to win`, Font.semiboldSystemFont(11), Color.white());
    const p = data.plays[0];
    if (p) text(w, `${p.td ? 'TD ' : ''}${p.name} ${p.label.replace(/\bTD\s/, '')}`, Font.regularSystemFont(10), Color.white());
    return w;
  }

  if (family === 'small') {
    w.setPadding(12, 12, 12, 12);
    header(w, data);
    w.addSpacer(6);
    await teamRow(w, data.me, data, { icon: 16, name: 11, score: 17 });
    w.addSpacer(3);
    await teamRow(w, data.opp, data, { icon: 16, name: 11, score: 17 });
    w.addSpacer(6);
    winRow(w, data, 134);
    w.addSpacer();
    const p = data.plays[0];
    if (p) playRow(w, p, { size: 9 });
    else text(w, data.state === 'pre' ? 'Kickoff soon' : 'No big plays yet', Font.regularSystemFont(9), C.muted);
    return w;
  }

  if (family === 'medium') {
    w.setPadding(12, 14, 12, 14);
    const cols = w.addStack();
    const left = cols.addStack();
    left.layoutVertically();
    left.size = new Size(140, 0);
    header(left, data);
    left.addSpacer(8);
    await teamRow(left, data.me, data, { icon: 18, name: 11, score: 18, proj: true });
    left.addSpacer(5);
    await teamRow(left, data.opp, data, { icon: 18, name: 11, score: 18, proj: true });
    left.addSpacer(7);
    winRow(left, data, 140);
    cols.addSpacer(14);
    const right = cols.addStack();
    right.layoutVertically();
    text(right, 'KEY PLAYS', Font.heavySystemFont(9), C.muted);
    right.addSpacer(5);
    if (!data.plays.length) noPlays(right, data, 10);
    for (const p of data.plays.slice(0, 4)) {
      playRow(right, p, { size: 10, time: true });
      right.addSpacer(4);
    }
    right.addSpacer();
    return w;
  }

  // large (and anything larger)
  w.setPadding(16, 16, 16, 16);
  header(w, data);
  w.addSpacer(10);
  await teamRow(w, data.me, data, { icon: 26, name: 15, score: 28, proj: true });
  w.addSpacer(8);
  await teamRow(w, data.opp, data, { icon: 26, name: 15, score: 28, proj: true });
  w.addSpacer(10);
  winRow(w, data, 306);
  w.addSpacer(14);
  text(w, 'KEY PLAYS', Font.heavySystemFont(10), C.muted);
  w.addSpacer(6);
  if (!data.plays.length) noPlays(w, data, 12);
  for (const p of data.plays.slice(0, 8)) {
    playRow(w, p, { size: 12, time: true });
    w.addSpacer(6);
  }
  w.addSpacer();
  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  text(w, 'GRIDLOCK', Font.heavySystemFont(11), C.accent);
  w.addSpacer(4);
  text(w, message, Font.regularSystemFont(11), C.muted, { lines: 4 });
  w.refreshAfterDate = new Date(Date.now() + 10 * 60000);
  return w;
}

const family = config.widgetFamily || 'large';
let widget;
try {
  widget = await build(await loadData(await franchiseParam()), family);
} catch (e) {
  widget = errorWidget(`Couldn't load scores. ${e.message || e}`);
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (family === 'small') {
  await widget.presentSmall();
} else if (family === 'medium') {
  await widget.presentMedium();
} else {
  await widget.presentLarge();
}
Script.complete();
