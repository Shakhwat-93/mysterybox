import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const cpanelTemplateDir = path.join(root, 'cpanel');
const deployDir = path.join(root, 'deploy');
const outputDir = path.join(deployDir, 'cpanel-upload');

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function phpString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readCourierApiKey() {
  if (process.env.BDCOURIER_API_KEY) return process.env.BDCOURIER_API_KEY;

  const courierDocPath = path.join(root, 'qurier.md');
  if (!(await pathExists(courierDocPath))) return '';

  const text = await fs.readFile(courierDocPath, 'utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const apiKeyIndex = lines.findIndex((line) => /^api key$/i.test(line));
  if (apiKeyIndex >= 0 && lines[apiKeyIndex + 1]) return lines[apiKeyIndex + 1];

  const bearerMatch = text.match(/Bearer\s+([A-Za-z0-9._-]{20,})/);
  if (bearerMatch) return bearerMatch[1];

  const longTokenMatch = text.match(/\b[A-Za-z0-9._-]{40,}\b/);
  return longTokenMatch ? longTokenMatch[0] : '';
}

async function copyTemplateFiles(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyTemplateFiles(sourcePath, targetPath);
      continue;
    }

    if (entry.name === 'config.example.php') continue;
    await fs.copyFile(sourcePath, targetPath);
  }
}

if (!(await pathExists(distDir))) {
  throw new Error('Missing dist folder. Run npm run build first.');
}

const envPath = path.join(root, '.env.local');
const env = parseEnv(await fs.readFile(envPath, 'utf8'));
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const courierApiKey = await readCourierApiKey();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.cp(distDir, outputDir, { recursive: true });
await copyTemplateFiles(cpanelTemplateDir, outputDir);

const configPhp = `<?php
declare(strict_types=1);

const SUPABASE_URL = ${phpString(supabaseUrl)};
const SUPABASE_SERVICE_ROLE_KEY = ${phpString(serviceRoleKey)};
const BDCOURIER_API_KEY = ${phpString(courierApiKey)};
const META_GRAPH_VERSION = 'v25.0';
`;

await fs.writeFile(path.join(outputDir, 'api', 'config.php'), configPhp, 'utf8');

await fs.writeFile(
  path.join(outputDir, 'README-UPLOAD.txt'),
  [
    'Upload everything inside this folder to cPanel public_html, or upload the zip and extract it in public_html.',
    'Required cPanel features: Apache .htaccess rewrite support and PHP with cURL enabled.',
    'Do not move the api folder. The React app calls /api/create-order, /api/pixel-config, /api/meta-capi, and /api/tiktok-events.',
    'Courier check calls /api/courier-check and stores each order result once in Supabase.',
    'BDCourier API key can be saved from Admin > Courier Setup. The generated config key is only a fallback.',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`cPanel upload folder ready: ${outputDir}`);
