// Inspects dist/index.html (run `npm run build:pages` first) and asserts launch SEO requirements.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://knotenvy.github.io/KnotzMoonPatrol/';
const BASE = '/KnotzMoonPatrol/';
const dist = process.argv[2] ?? 'dist';
const errors = [];
const check = (ok, msg) => {
  if (!ok) errors.push(msg);
};
const fail = () => {
  console.error('SEO check failed:\n- ' + errors.join('\n- '));
  process.exit(1);
};
const read = (f) => readFileSync(join(dist, f), 'utf8');

if (!existsSync(join(dist, 'index.html'))) {
  check(false, 'dist/index.html missing (run npm run build:pages)');
  fail();
}
const html = read('index.html');
const tag = (re) => html.match(re)?.[1];
const meta = (attr, name) =>
  tag(new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`, 's'));

const title = tag(/<title>([^<]*)<\/title>/);
check(title && title.length <= 60, `title missing or over 60 chars: ${title}`);
for (const n of ['description', 'theme-color', 'robots'])
  check(meta('name', n), `meta name=${n} missing`);
const desc = meta('name', 'description') ?? '';
check(desc.length >= 50 && desc.length <= 200, `description length ${desc.length} out of range`);
check(tag(/<link rel="canonical" href="([^"]*)"/) === SITE, `canonical must equal ${SITE}`);
for (const p of [
  'og:type',
  'og:site_name',
  'og:title',
  'og:description',
  'og:url',
  'og:locale',
  'og:image',
  'og:image:secure_url',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
])
  check(meta('property', p), `meta property=${p} missing`);
for (const n of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'])
  check(meta('name', n), `meta name=${n} missing`);
check(meta('property', 'og:title') === title, 'og:title differs from <title>');
check(meta('name', 'twitter:title') === title, 'twitter:title differs from <title>');
check(meta('property', 'og:url') === SITE, `og:url must equal ${SITE}`);

const img = meta('property', 'og:image');
check(img?.startsWith(SITE), 'og:image must be an absolute Pages URL');
check(meta('name', 'twitter:image') === img, 'twitter:image differs from og:image');
check(meta('property', 'og:image:secure_url') === img, 'og:image:secure_url differs from og:image');
if (img?.startsWith(SITE)) {
  const file = join(dist, img.slice(SITE.length));
  check(existsSync(file), `og:image not found in dist: ${file}`);
  if (existsSync(file)) {
    const b = readFileSync(file);
    let w;
    let h;
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i + 9 < b.length && b[i] === 0xff;) {
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          h = b.readUInt16BE(i + 5);
          w = b.readUInt16BE(i + 7);
          break;
        }
        i += 2 + b.readUInt16BE(i + 2);
      }
    } else if (b.toString('latin1', 1, 4) === 'PNG') {
      w = b.readUInt32BE(16);
      h = b.readUInt32BE(20);
    }
    const mw = meta('property', 'og:image:width');
    const mh = meta('property', 'og:image:height');
    check(String(w) === mw && String(h) === mh, `og:image is ${w}x${h}, meta says ${mw}x${mh}`);
  }
}

try {
  const j = JSON.parse(tag(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
  for (const k of [
    'name',
    'url',
    'image',
    'description',
    'genre',
    'gamePlatform',
    'applicationCategory',
    'operatingSystem',
    'offers',
    'author',
    'softwareVersion',
  ])
    check(j[k] !== undefined, `JSON-LD missing ${k}`);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  check(
    j.softwareVersion === pkg.version,
    `JSON-LD version ${j.softwareVersion} != package ${pkg.version}`,
  );
} catch (e) {
  check(false, `JSON-LD missing or invalid: ${e.message}`);
}
check(/<noscript>/.test(html), '<noscript> fallback missing');

const manifestHref = tag(/<link rel="manifest" href="([^"]*)"/);
check(manifestHref?.startsWith(BASE), `manifest link not under ${BASE}: ${manifestHref}`);
for (const f of [
  'site.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'favicon.svg',
  'apple-touch-icon.png',
])
  check(existsSync(join(dist, f)), `${f} missing from dist`);
try {
  const m = JSON.parse(read('site.webmanifest'));
  check(m.name && m.short_name && m.start_url && m.icons?.length, 'manifest incomplete');
  for (const ic of m.icons ?? [])
    check(existsSync(join(dist, ic.src)), `manifest icon missing: ${ic.src}`);
  check(
    m.icons?.some((i) => i.sizes === '192x192') && m.icons?.some((i) => i.sizes === '512x512'),
    'manifest needs 192 and 512 icons',
  );
} catch (e) {
  check(false, `manifest invalid: ${e.message}`);
}
if (existsSync(join(dist, 'robots.txt')))
  check(
    read('robots.txt').includes(`Sitemap: ${SITE}sitemap.xml`),
    'robots.txt lacks Sitemap line',
  );
if (existsSync(join(dist, 'sitemap.xml')))
  check(read('sitemap.xml').includes(`<loc>${SITE}</loc>`), 'sitemap.xml lacks site URL');

if (errors.length) fail();
console.log('SEO check passed.');
