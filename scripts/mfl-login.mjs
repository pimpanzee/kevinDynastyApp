#!/usr/bin/env node
/**
 * Signs in to MFL once and prints your login cookie (MFL_USER_ID), to store
 * as the write relay's MFL_COOKIE secret. Run it on your own computer:
 *
 *   node scripts/mfl-login.mjs [season]
 *
 * The password is typed hidden, sent only to MFL's HTTPS login in a POST
 * body, and never written anywhere. Treat the cookie it prints like a
 * password: it acts as you in every MFL league you're in, and MFL has no way
 * to sign it out. Paste it straight into Cloudflare, then clear your terminal.
 */

import { createInterface } from 'node:readline';

const season = process.argv[2] ?? String(new Date().getFullYear());
const userAgent = process.env.MFL_USER_AGENT || 'gridlock/1.0';

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo nothing after the prompt while the password is typed.
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const username = (await ask('MFL username: ')).trim();
const password = await ask('MFL password (hidden): ', true);

let url = `https://api.myfantasyleague.com/${season}/login`;
const body = new URLSearchParams({ USERNAME: username, PASSWORD: password, XML: '1' });
let res;
// Follow at most two redirects, and only to MFL over HTTPS, re-sending the POST.
for (let hop = 0; ; hop++) {
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent },
    body,
    redirect: 'manual',
  });
  const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
  if (!next) break;
  const target = new URL(next, url);
  if (hop >= 2 || target.protocol !== 'https:' || !/(^|\.)myfantasyleague\.com$/.test(target.hostname)) {
    console.error(`MFL redirected to ${target.origin}; not following.`);
    process.exit(1);
  }
  url = target.href;
}

const text = await res.text();
const error = /<error[^>]*>([\s\S]*?)<\/error>/i.exec(text);
const status = /<status\b([^>]*)>/i.exec(text);
// MFL names the attribute after the cookie: <status MFL_USER_ID="...">OK</status>.
const cookie = status && /\bMFL_USER_ID="([^"]+)"/.exec(status[1]);
if (error || !cookie) {
  // Show the reply's shape (tag and attribute names only), never its values.
  const shape = text.replace(/="[^"]*"/g, '="…"').replace(/>[^<]*</g, '><').slice(0, 300);
  console.error(`Login failed: ${error ? error[1].trim() : `unexpected reply (HTTP ${res.status}): ${shape}`}`);
  process.exit(1);
}

console.log(`
Signed in. Your MFL_COOKIE value is:

${cookie[1]}

Cloudflare → Workers & Pages → gridlock-live → Settings → Variables and Secrets
→ Add → type Secret, name MFL_COOKIE, paste the value above, Deploy.
Then clear this terminal.`);
