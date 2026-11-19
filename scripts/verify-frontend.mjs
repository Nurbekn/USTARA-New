#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'frontend/dist');
const base = (process.env.PUBLIC_BASE_PATH || '/USTARA-New/').replace(/\/?$/, '/');
const failures = [];
let checked = 0;

async function requireFile(file, label) {
  try {
    const s = await stat(file);
    if (!s.isFile() || !s.size) throw new Error('not a nonempty file');
    checked++;
    return true;
  } catch {
    failures.push(label + ' missing or empty: ' + file);
    return false;
  }
}
function localPath(url, fromFile) {
  const raw = url.split(/[?#]/)[0];
  if (!raw || /^(https?:|data:|\/\/|#)/i.test(raw)) return null;
  let relative;
  if (raw.startsWith('/')) {
    if (!raw.startsWith(base)) {
      failures.push('Absolute asset URL is outside deployment base ' + base + ': ' + raw);
      return null;
    }
    relative = raw.slice(base.length);
  } else {
    relative = path.relative(dist, path.resolve(path.dirname(fromFile), raw));
  }
  const result = path.resolve(dist, relative);
  if (result !== dist && !result.startsWith(dist + path.sep)) {
    failures.push('Asset escapes dist: ' + url);
    return null;
  }
  return result;
}

const htmlFile = path.join(dist, 'index.html');
if (await requireFile(htmlFile, 'index.html')) {
  const html = await readFile(htmlFile, 'utf8');
  let scripts = 0;
  let manifestFile;
  for (const element of html.matchAll(/<(script|link|img)\b[^>]*>/gi)) {
    const tag = element[0];
    const attr = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!attr) continue;
    const url = attr[1];
    if (/^https?:|^\/\/|^data:/i.test(url)) continue;
    const output = localPath(url, htmlFile);
    if (!output) continue;
    if (element[1].toLowerCase() === 'script' && /\.(?:js|mjs)(?:[?#]|$)/i.test(url)) scripts++;
    if (/\.webmanifest(?:[?#]|$)|manifest\.json(?:[?#]|$)/i.test(url)) manifestFile = output;
    await requireFile(output, 'HTML asset ' + url);
  }
  if (!scripts) failures.push('No built JavaScript entry found in index.html');
  if (manifestFile) {
    try {
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
      if (!Array.isArray(manifest.icons) || !manifest.icons.length) failures.push('Manifest has no icons');
      else for (const icon of manifest.icons) {
        if (!icon.src) { failures.push('Manifest icon missing src'); continue; }
        const p = localPath(icon.src, manifestFile);
        if (p) await requireFile(p, 'Manifest icon ' + icon.src);
      }
    } catch (e) { failures.push('Manifest invalid: ' + e.message); }
  }
}
console.log(JSON.stringify({ passed: failures.length === 0, base, checked, failures }, null, 2));
if (failures.length) process.exitCode = 1;
