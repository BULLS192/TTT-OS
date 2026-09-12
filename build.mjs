import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const skip = new Set(['.git', '.github', '.vercel', 'dist', 'node_modules', 'package.json', 'package-lock.json', 'build.mjs', 'vercel.json']);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (skip.has(entry.name) || entry.name === 'index.html') continue;
  await cp(path.join(root, entry.name), path.join(dist, entry.name), { recursive: true });
}

const authEnabled = process.env.TTT_AUTH_ENABLED === 'true';
const authConfig = {
  enabled: authEnabled,
  supabaseUrl: process.env.TTT_SUPABASE_URL || '',
  publishableKey: process.env.TTT_SUPABASE_PUBLISHABLE_KEY || '',
  redirectPath: '/',
  appName: 'TTT OS',
  supportText: 'Authorized Thompson Transportation Technologies personnel only.'
};
await writeFile(
  path.join(dist, 'auth-config.js'),
  `window.TTT_AUTH_CONFIG = Object.freeze(${JSON.stringify(authConfig)});\n`,
  'utf8'
);

let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace(
  '</head>',
  '<meta name="robots" content="noindex,nofollow,noarchive">\n<link rel="stylesheet" href="auth.css">\n<script src="auth-config.js"></script>\n<script>if(window.TTT_AUTH_CONFIG&&window.TTT_AUTH_CONFIG.enabled){document.documentElement.classList.add("ttt-auth-pending")}</script>\n</head>'
);
html = html.replace(
  '<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js"></script>\n<script src="auth.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>'
);

await writeFile(path.join(dist, 'index.html'), html, 'utf8');
console.log(`TTT OS production bundle generated in dist/ (auth ${authEnabled ? 'enabled' : 'disabled'}).`);
