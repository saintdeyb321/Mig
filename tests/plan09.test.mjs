import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { it } from 'node:test';

const css = readFileSync(new URL('../frontend/src/shared/styles/theme.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})/g)].map(match => [match[1], match[2]]));
const luminance = color => {
  const [r, g, b] = color.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return r * .2126 + g * .7152 + b * .0722;
};
const contrast = (fg, bg) => {
  const a = luminance(tokens[fg]), b = luminance(tokens[bg]);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};
it('P09 keeps critical text, semantic statuses, brand endpoints and control boundaries readable', () => {
  for (const [fg, bg, minimum] of [
    ['ink', 'canvas', 4.5], ['muted', 'canvas', 4.5], ['muted', 'panel', 4.5], ['primary', 'panel', 4.5], ['accent', 'panel', 4.5],
    ['success', 'success-soft', 4.5], ['danger', 'danger-soft', 4.5], ['warning', 'warning-soft', 4.5], ['primary', 'primary-soft', 4.5],
    ['sidebar-muted', 'sidebar', 4.5], ['sidebar-muted', 'brand-deep', 4.5], ['control', 'panel', 3], ['control', 'subtle', 3],
    ['focus', 'panel', 3], ['sidebar-glow', 'brand-deep', 3],
  ]) assert.ok(contrast(fg, bg) >= minimum, `${fg}/${bg} contrast ${contrast(fg, bg).toFixed(2)} < ${minimum}`);
});

it('P09-07 rejects accidental JSX markup in user-visible JavaScript strings', () => {
  const { parse } = createRequire(new URL('../frontend/package.json', import.meta.url))('espree');
  const failures = [];
  const visit = (node, file) => {
    if (!node || typeof node !== 'object') return;
    const text = node.type === 'Literal' ? node.value : node.type === 'TemplateElement' ? node.value.cooked : null;
    if (typeof text === 'string' && /<[A-Z][\w.]*(?:\s|\/?>)/.test(text)) failures.push(`${file}:${node.loc.start.line}: ${text}`);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child, file));
      else if (value && typeof value === 'object') visit(value, file);
    }
  };
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) walk(file);
      else if (/\.jsx?$/.test(entry.name)) visit(parse(readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true }), file.pathname);
    }
  };
  walk(new URL('../frontend/src/', import.meta.url));
  assert.deepEqual(failures, [], 'Render components as JSX nodes, never as literal tag strings');
});
