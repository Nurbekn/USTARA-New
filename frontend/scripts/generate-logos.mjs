// Regenerate standalone assets from the same geometry used by React.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const concepts = JSON.parse(await readFile(new URL('../src/components/brand/concepts.json', import.meta.url), 'utf8'));
const lettering = JSON.parse(await readFile(new URL('../src/components/brand/wordmark.json', import.meta.url), 'utf8'));
const directory = new URL('../public/brand/', import.meta.url);
await mkdir(directory, { recursive: true });
const paths = (concept) => concept.paths.map((d) => `<path d="${d}" fill-rule="evenodd"/>`).join('');
const svg = (viewBox, content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Ustara">${content}</svg>\n`;
const wordmark = (color, x = 0) => `<g transform="translate(${x} 20) scale(.44)"><g fill="none" stroke="${color}" stroke-width="8" stroke-linejoin="round">${lettering.paths.map((d) => `<path d="${d}"/>`).join('')}</g><circle cx="${lettering.dot.cx}" cy="${lettering.dot.cy}" r="${lettering.dot.r}" fill="#00B9FF"/></g>`;

for (const concept of concepts) {
  await writeFile(new URL(`${concept.id}.svg`, directory), svg('0 0 64 64', `<g fill="#60A5FA">${paths(concept)}</g>`));
  if (concept.faviconPaths) {
    await writeFile(new URL(`${concept.id}-favicon.svg`, directory), svg('0 0 64 64', `<g fill="#60A5FA">${paths({ paths: concept.faviconPaths })}</g>`));
  }
  for (const [theme, color] of [['dark', '#FFFFFF'], ['light', '#0B1120']]) {
    await writeFile(new URL(`${concept.id}-${theme}.svg`, directory), svg('0 0 240 64', `<g fill="#60A5FA">${paths(concept)}</g>${wordmark(color, 78)}`));
  }
}
for (const [theme, color] of [['dark', '#FFFFFF'], ['light', '#0B1120']]) {
  await writeFile(new URL(`wordmark-${theme}.svg`, directory), svg('0 0 164 64', wordmark(color, 2)));
}

// The approved brand artwork is the single source for all primary logo assets.
const approved = await readFile(new URL('../src/components/brand/ustara.svg', import.meta.url), 'utf8');
const artwork = approved.slice(approved.indexOf('>') + 1, approved.lastIndexOf('</svg>'));
for (const name of ['ustara', 'facet', 'facet-favicon']) {
  await writeFile(new URL(`${name}.svg`, directory), approved);
}
for (const [theme, color] of [['dark', '#FFFFFF'], ['light', '#0B1120']]) {
  const lockup = svg('0 0 240 64', `<g transform="scale(.5)">${artwork}</g>${wordmark(color, 78)}`);
  await writeFile(new URL(`facet-${theme}.svg`, directory), lockup);
}
