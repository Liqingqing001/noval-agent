import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runLibraryImport } from './import-demo-library.mjs';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(resolve(tmpdir(), 'novel-agent-library-'));
try {
  const databasePath = resolve(directory, 'snapshot.db');
  const databaseUrl = `file:${databasePath}`;
  await writeFile(databasePath, '');
  execFileSync(process.execPath, [resolve(projectRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', resolve(projectRoot, 'packages/backend/prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
  console.log(JSON.stringify(await runLibraryImport({ databaseUrl })));
  await runLibraryImport({ databaseUrl, check: true });
} finally { await rm(directory, { recursive: true, force: true }); }
