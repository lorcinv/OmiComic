import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postcss, { type Plugin } from 'postcss';

// Resolve only the app's sRGB theme mixes at build time. Modern WebViews keep
// the original expression; old WebViews receive the same RGBA color for each
// theme, without a runtime stylesheet rewrite or a different phone design.
export function androidCssCompat(): Plugin {
  const themes = ['mist', 'nord', 'sand', 'night'];
  const theme = postcss.parse(readFileSync('src/styles/theme.css', 'utf8'), { from: 'src/styles/theme.css' });
  const palettes = themes.map(name => {
    const values = new Map<string, string>();
    theme.walkRules(rule => {
      const matches = rule.selector.split(',').some(selector => {
        const s = selector.trim();
        return s === ':root' || s === `[data-color-theme="${name}"]`
          || s === `:root[data-color-theme="${name}"]`
          || s === ':root:not([data-color-theme="night"])' && name !== 'night';
      });
      if (matches) rule.walkDecls(decl => { if (decl.prop.startsWith('--')) values.set(decl.prop, decl.value); });
    });
    return values;
  });
  function rgba(value: string, palette: Map<string, string>): number[] {
    value = value.trim();
    const variable = /^var\((--[^,)]+)\)$/.exec(value);
    if (variable) {
      const color = palette.get(variable[1]);
      if (!color) throw Error(`Unknown Android theme color: ${variable[1]}`);
      return rgba(color, palette);
    }
    if (value.startsWith('color-mix(')) return mix(value, palette);
    if (value === 'transparent') return [0, 0, 0, 0];
    if (value === 'black') return [0, 0, 0, 1];
    if (value === 'white') return [255, 255, 255, 1];
    if (/^#[\da-f]{3,8}$/i.test(value)) {
      let hex = value.slice(1);
      if (hex.length < 5) hex = [...hex].map(c => c + c).join('');
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1];
    }
    throw Error(`Unsupported Android theme mix: ${value}`);
  }
  function mix(expression: string, palette: Map<string, string>): number[] {
    const m = /^color-mix\(\s*in srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)$/.exec(expression);
    if (!m) throw Error(`Unsupported Android color mix: ${expression}`);
    const a = rgba(m[1], palette), b = rgba(m[3], palette), weight = Number(m[2]) / 100;
    const alpha = a[3] * weight + b[3] * (1 - weight);
    return [...[0, 1, 2].map(i => alpha ? (a[i] * a[3] * weight + b[i] * b[3] * (1 - weight)) / alpha : 0), alpha];
  }
  return {
    postcssPlugin: 'omi-android-theme-compat',
    Once(root) {
      const mixes = new Map<string, string>();
      root.walkDecls(decl => {
        // Balanced parentheses include var() and any future nested mixes.
        decl.value = decl.value.replace(/color-mix\(/g, (start, offset, source) => {
          let depth = 1, end = offset + start.length;
          while (depth && end < source.length) { const c = source[end++]; if (c === '(') depth++; else if (c === ')') depth--; }
          const expression = source.slice(offset, end);
          const token = '--omi-mix-' + createHash('sha1').update(expression).digest('hex').slice(0, 10);
          mixes.set(token, expression);
          // The following pass replaces the full expression, not this prefix.
          return start;
        });
        for (const [token, expression] of mixes) decl.value = decl.value.split(expression).join(`var(${token},${expression})`);
      });
      if (!mixes.size) return;
      const supports = postcss.atRule({ name: 'supports', params: 'not (color:color-mix(in srgb,black,white))' });
      for (let i = 0; i < themes.length; i++) {
        const rule = postcss.rule({ selector: i === 0 ? ':root,[data-color-theme="mist"]' : `[data-color-theme="${themes[i]}"]` });
        for (const [token, expression] of mixes) {
          const [r, g, b, a] = mix(expression, palettes[i]);
          rule.append({ prop: token, value: `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Number(a.toFixed(5))})` });
        }
        supports.append(rule);
      }
      root.append(supports);
      // Dynamic viewport units appeared after several deployed tablet WebViews.
      // Put vh before dvh in Android CSS; newer devices keep the final value.
    },
    Declaration(decl) {
      if (decl.value.includes('dvh')) decl.cloneBefore({ value: decl.value.replace(/dvh/g, 'vh') });
    },
  };
}
