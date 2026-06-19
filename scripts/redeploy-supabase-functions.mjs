import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const functionsDir = path.join(repoRoot, 'supabase', 'functions');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const passthroughArgs = argv.filter((arg) => arg !== '--dry-run');

function listFunctionNames() {
  const entries = readdirSync(functionsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && name !== '_shared')
    .sort((a, b) => a.localeCompare(b));
}

function runDeploy(functionName) {
  const args = ['functions', 'deploy', functionName, ...passthroughArgs];
  const cmdText = `supabase ${args.join(' ')}`;

  if (dryRun) {
    console.log(`[dry-run] ${cmdText}`);
    return 0;
  }

  console.log(`\n==> Deploying ${functionName}`);
  const result = spawnSync('supabase', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (typeof result.status !== 'number') {
    console.error(`Failed to run supabase CLI for ${functionName}.`);
    return 1;
  }

  return result.status;
}

const functions = listFunctionNames();
if (functions.length === 0) {
  console.error('No deployable Supabase functions found.');
  process.exit(1);
}

console.log(`Found ${functions.length} functions:`);
console.log(functions.join(', '));

for (const fn of functions) {
  const code = runDeploy(fn);
  if (code !== 0) {
    console.error(`\nDeployment stopped at function: ${fn}`);
    process.exit(code);
  }
}

console.log(dryRun ? '\nDry-run complete.' : '\nAll Supabase functions deployed successfully.');

