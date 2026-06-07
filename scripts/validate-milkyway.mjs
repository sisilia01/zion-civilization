import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/textures/milkyway.jpg');
const SRC = path.join(ROOT, 'public/textures/milkyway_source.txt');
const TMP = path.join(ROOT, 'public/textures/_candidate.jpg');

const URLS = [
  { label: 'A', url: 'https://cdn.eso.org/images/large/eso0932a.jpg' },
  { label: 'B', url: 'https://www.solarsystemscope.com/textures/download/8k_stars_milky_way.jpg' },
  { label: 'C', url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k_print.jpg' },
  { label: 'D', url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.jpg' },
  { label: 'E', url: 'https://www.eso.org/public/archives/images/large/eso0932a.jpg' },
];

function isRoomPhoto(label, url, mean, w, h) {
  if (/studio_small|polyhaven.*HDRIs\/jpg\/studio/i.test(url)) return true;
  return false;
}

async function analyze(file) {
  const meta = await sharp(file).metadata();
  const w = meta.width;
  const h = meta.height;
  const { data, info } = await sharp(file)
    .resize(Math.min(w, 512), null, { withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  const ch = info.channels;
  const pixels = data.length / ch;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    sum += (r + g + b) / 3;
  }
  const mean = sum / pixels;
  return { w, h, mean };
}

function validate(label, url, size, w, h, mean) {
  const reasons = [];
  if (size <= 200 * 1024) reasons.push('size<=200KB');
  if (mean < 2) reasons.push('pure black (mean<2)');
  if (mean < 2 || mean > 60) reasons.push(`mean ${mean.toFixed(2)} not in 2-60`);
  else if (mean > 60) reasons.push(`mean ${mean.toFixed(2)} > 60`);
  const ratio = w / h;
  if (Math.abs(ratio - 2) > 0.15) reasons.push(`ratio ${ratio.toFixed(3)} not ~2:1`);
  if (isRoomPhoto(label, url, mean, w, h)) reasons.push('room/non-starfield');
  const pass = reasons.length === 0;
  return { pass, reasons, ratio };
}

const attempts = [];

for (const { label, url } of URLS) {
  const entry = { label, url, error: null, w: null, h: null, mean: null, size: null, pass: false, reasons: [] };
  try {
    fs.mkdirSync(path.dirname(TMP), { recursive: true });
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZION/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(TMP, buf);
    const size = fs.statSync(TMP).size;
    entry.size = size;
    const { w, h, mean } = await analyze(TMP);
    entry.w = w;
    entry.h = h;
    entry.mean = mean;
    const v = validate(label, url, size, w, h, mean);
    entry.pass = v.pass;
    entry.reasons = v.reasons;
    entry.ratio = v.ratio;
    attempts.push(entry);
    if (v.pass) {
      fs.copyFileSync(TMP, OUT);
      fs.writeFileSync(SRC, `${label}|${url}\n`);
      fs.unlinkSync(TMP);
      console.log(JSON.stringify({ winner: label, url, dimensions: `${w}x${h}`, mean: +mean.toFixed(2), size, status: 'PASS', attempts }, null, 2));
      process.exit(0);
    }
  } catch (e) {
    entry.error = e.message || String(e);
    attempts.push(entry);
    try {
      fs.unlinkSync(TMP);
    } catch (_) {}
  }
}

console.log(JSON.stringify({ winner: null, status: 'ALL_FAIL', attempts }, null, 2));
process.exit(1);
