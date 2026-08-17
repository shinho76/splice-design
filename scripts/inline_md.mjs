import { readFileSync, writeFileSync } from 'node:fs';
const base = new URL('../docs/', import.meta.url);
let md = readFileSync(new URL('BLOCK_SHEAR_1ROW.md', base), 'utf8');
// ![](파단선/.../x.svg) → data URI
md = md.replace(/!\[([^\]]*)\]\((파단선\/[^)]+\.svg)\)/g, (m, alt, p) => {
  try {
    const svg = readFileSync(new URL(p, base), 'utf8');
    const b64 = Buffer.from(svg, 'utf8').toString('base64');
    return `![${alt}](data:image/svg+xml;base64,${b64})`;
  } catch (e) { return m; }
});
const out = new URL('파단선/BLOCK_SHEAR_ALL.md', base);
writeFileSync(out, md, 'utf8');
console.log('inlined →', out.pathname, md.length, 'chars');
