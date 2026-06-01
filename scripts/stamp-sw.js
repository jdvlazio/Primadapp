#!/usr/bin/env node
/* ============================================================
   stamp-sw.js — estampa el CACHE_VERSION del Service Worker.
   Lo invoca el git hook pre-commit: reemplaza el valor de
   CACHE_VERSION en sw.js por un sello fecha+hash-corto, y re-stagea
   sw.js para que el commit incluya la versión nueva.
   Así cada commit/push invalida el caché viejo automáticamente.
   ------------------------------------------------------------
   Sello: YYYYMMDD-HHMMSS-<short> (corto = hash del árbol actual o 'wip').
   Idempotente: vuelve a sellar desde cualquier valor previo.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');

function shortRef() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); }
  catch (e) { return 'wip'; }
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${ts}-${shortRef()}`;
}

let src = fs.readFileSync(SW, 'utf8');
const version = stamp();
// Reemplaza el placeholder o cualquier valor previo de CACHE_VERSION.
const re = /const CACHE_VERSION = '[^']*';/;
if (!re.test(src)) { console.error('stamp-sw: no encontré CACHE_VERSION en sw.js'); process.exit(1); }
src = src.replace(re, `const CACHE_VERSION = '${version}';`);
fs.writeFileSync(SW, src);
console.log('stamp-sw: CACHE_VERSION =', version);

// Re-stagear sw.js si estamos dentro de un commit (hook).
try { execSync('git add sw.js', { cwd: ROOT }); } catch (e) {}
