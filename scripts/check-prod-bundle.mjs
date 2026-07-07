#!/usr/bin/env node
const url = process.argv[2] || 'https://grudge-arena.grudge-studio.com/assets/game-CuyuTcCt.js';
const res = await fetch(url);
const t = await res.text();
console.log('url', url, 'status', res.status, 'bytes', t.length);
console.log('magic/standing run back', t.includes('magic/standing run back'));
console.log('locomotion/walking in walkBack', /walkBack.*locomotion\/walking/.test(t));
const hits = [...t.matchAll(/walkBack:"([^"]+)"/g)].map((m) => m[1]);
console.log('walkBack paths', [...new Set(hits)]);