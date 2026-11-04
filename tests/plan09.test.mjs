import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
