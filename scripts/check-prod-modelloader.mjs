#!/usr/bin/env node
const base = process.argv[2] || 'https://grudge-arena.grudge-studio.com';
const html = await fetch(`${base}/`).then((r) => r.text());
const m = html.match(/modelLoader-[^"]+\.js/);
const file = m ? m[0] : 'modelLoader-clQh__qu.js';
const url = `${base}/assets/${file}`;
const t = await fetch(url).then((r) => r.text());
console.log('bundle', url, 'bytes', t.length);
console.log('magic/standing run back', t.includes('magic/standing run back'));
const walkBack = [...new Set([...t.matchAll(/walkBack:"([^"]+)"/g)].map((x) => x[1]))];
const aimIdle = [...new Set([...t.matchAll(/aimIdle:"([^"]+)"/g)].map((x) => x[1]))];
console.log('walkBack paths', walkBack);
console.log('aimIdle paths', aimIdle);