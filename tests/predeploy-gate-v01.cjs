'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const checkedScripts = new Set();

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function fail(message) {
  failures.push(message);
  console.error('FAIL', message);
}

function pass(message) {
  console.log('PASS', message);
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.vercel') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function localSourcePath(src, baseDir) {
  if (!src) return null;
  const raw = String(src).trim();
  if (/^(?:https?:)?\/\//i.test(raw) || /^(?:data|blob):/i.test(raw)) return null;
  const clean = raw.split(/[?#]/, 1)[0].trim();
  if (!clean) return null;
  return clean.startsWith('/')
    ? path.join(ROOT, clean.slice(1))
    : path.resolve(baseDir, clean);
}

function extractScriptSources(source) {
  const found = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(source))) found.push(match[1]);
  return found;
}

function syntaxCheck(file) {
  if (checkedScripts.has(file)) return;
  checkedScripts.add(file);
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    fail(`JavaScript syntax error in ${rel(file)}: ${(result.stderr || result.stdout || '').trim()}`);
  }
}

function queueScript(file, queue) {
  if (!fs.existsSync(file)) {
    fail(`Referenced script does not exist: ${rel(file)}`);
    return;
  }
  if (!/\.(?:c?js|mjs)$/i.test(file)) return;
  if (!checkedScripts.has(file)) queue.push(file);
}

const htmlFiles = walk(ROOT, file => file.endsWith('.html'));
const queue = [];

for (const html of htmlFiles) {
  const source = fs.readFileSync(html, 'utf8');
  for (const src of extractScriptSources(source)) {
    const file = localSourcePath(src, path.dirname(html));
    if (file) queueScript(file, queue);
  }
}
pass(`Discovered ${queue.length} local script entry references from ${htmlFiles.length} HTML file(s)`);

while (queue.length) {
  const file = queue.shift();
  if (checkedScripts.has(file)) continue;
  syntaxCheck(file);
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const src of extractScriptSources(source)) {
    const nested = localSourcePath(src, path.dirname(file));
    if (nested) queueScript(nested, queue);
  }
}

const criticalFiles = [
  'app.js',
  'nav-shell-v05.js',
  'crm-v24.js',
  'tessa-admin-v01.js',
  'erp-product-master-v22.js',
  'website-analytics-v02.js'
];

for (const name of criticalFiles) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) fail(`Critical runtime file is missing: ${name}`);
  else syntaxCheck(file);
}

try {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const nav = fs.readFileSync(path.join(ROOT, 'nav-shell-v05.js'), 'utf8');

  const requiredIndexMarkers = ['app.js', 'nav-shell-v05.js', 'account-v01.js'];
  for (const marker of requiredIndexMarkers) {
    assert(index.includes(marker), `index.html no longer references ${marker}`);
  }

  const requiredBootstrapMarkers = [
    'app-core.js',
    'cloud-sync.js',
    'customer-intakes-v01.js',
    'crm-v24.js',
    'tessa-admin-v01.js',
    'erp-product-master-v22.js',
    'website-analytics-v02.js'
  ];
  for (const marker of requiredBootstrapMarkers) {
    assert(app.includes(marker), `app.js no longer bootstraps ${marker}`);
  }

  assert(nav.includes('data-crm-tab="leads"'), 'modern CRM shell sentinel is missing');
  assert(nav.includes('tessa-shell-nav'), 'Tessa navigation sentinel is missing');
  assert(nav.includes('websiteAnalytics'), 'Website Analytics navigation sentinel is missing');
  const erpMaster = fs.readFileSync(path.join(ROOT, 'erp-product-master-v22.js'), 'utf8');
  assert(erpMaster.includes('async function fetchAllProducts(c,o)'), 'ERP Product Master pagination helper is missing');
  assert(erpMaster.includes('.range(from,to)'), 'ERP Product Master no longer paginates the catalog query');
  assert(erpMaster.includes('fetchAllProducts(c,o),'), 'ERP Product Master load path does not use the paginated fetch');
  const beforePaginationHelper = erpMaster.split('async function fetchAllProducts(c,o)')[0];
  assert(!beforePaginationHelper.includes('fetchAllProducts(c,o)'), 'ERP Product Master calls pagination before initialization');

  assert(!app.includes("');\\n  document.write"), 'app.js contains the escaped-newline bootstrap corruption signature');
  assert(!nav.includes("Assistant',\\n"), 'nav-shell-v05.js contains the escaped-newline corruption signature');

  pass('Bootstrap graph and modern-shell sentinels are intact');
} catch (err) {
  fail(err.message);
}

for (const jsonFile of ['vercel.json', 'site.webmanifest']) {
  try {
    JSON.parse(fs.readFileSync(path.join(ROOT, jsonFile), 'utf8'));
    pass(`${jsonFile} is valid JSON`);
  } catch (err) {
    fail(`${jsonFile} is invalid JSON: ${err.message}`);
  }
}

if (failures.length) {
  console.error(`\nPRE-DEPLOY GATE FAILED: ${failures.length} problem(s) found.`);
  process.exit(1);
}

console.log(`\nPRE-DEPLOY GATE PASSED: ${checkedScripts.size} deployed JavaScript file(s) parsed successfully.`);
