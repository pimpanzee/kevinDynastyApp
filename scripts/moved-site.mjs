#!/usr/bin/env node
/**
 * Builds what the old GitHub Pages address serves now that the site lives on
 * Cloudflare Pages: every page sends you to the same page at the new
 * address. An app added to the Home Screen from the old address can't follow
 * a redirect to another site, so there it explains how to add the new one.
 *
 *   node scripts/moved-site.mjs <built site dir> <new site URL> <out dir> [old base path]
 *
 * widget.json is copied across so Home Screen widgets set up with the old
 * address keep working until they are pointed at the new one.
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [built, siteUrl, out, basePath = ''] = process.argv.slice(2);
if (!built || !siteUrl || !out) {
  console.error('usage: moved-site.mjs <built site dir> <new site URL> <out dir> [old base path]');
  process.exit(1);
}
const site = new URL(siteUrl).href.replace(/\/$/, '');
const host = new URL(site).host;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>The Liam has moved</title>
<style>
  body { margin: 0; padding: 40px 20px; background: #0b0f15; color: #e8edf3; font: 16px/1.5 system-ui, -apple-system, sans-serif; }
  h1 { margin: 0 0 12px; font-size: 26px; letter-spacing: .02em; text-transform: uppercase; }
  a { color: #d7ff3c; font-weight: 600; }
  p { max-width: 34em; }
</style>
</head>
<body>
<h1>The Liam has moved</h1>
<p>It now lives at <a id="go" href="${site}/">${host}</a>.</p>
<p id="home" hidden>You opened it from your Home Screen. Open the link above in Safari (or Chrome on Android), add it to your Home Screen again, then delete this old icon. To make moves, sign in from Settings in the new app.</p>
<script>
  var base = ${JSON.stringify(basePath.replace(/\/$/, ''))};
  var path = base && location.pathname.indexOf(base) === 0 ? location.pathname.slice(base.length) : location.pathname;
  var url = ${JSON.stringify(site)} + (path || '/') + location.search + location.hash;
  document.getElementById('go').href = url;
  var standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (standalone) document.getElementById('home').hidden = false;
  else location.replace(url);
</script>
</body>
</html>
`;

// Replaces the old app's service worker with one that removes itself.
const sw = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), page);
writeFileSync(join(out, '404.html'), page);
writeFileSync(join(out, 'sw.js'), sw);
writeFileSync(join(out, '.nojekyll'), '');
if (existsSync(join(built, 'widget.json'))) copyFileSync(join(built, 'widget.json'), join(out, 'widget.json'));
console.log(`Old address now points to ${site}`);
