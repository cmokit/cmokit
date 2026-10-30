// Readies a Claude Code cloud session, run by the SessionStart hook in `.claude/settings.json`; it
// does nothing anywhere else. A cloud session's VM has Node 22, and this repository needs Node 24
// (ADR-0007), so the script installs the pinned version below from nodejs.org, after checking its
// checksum, puts it first on the path of every command Claude runs, and installs the dependencies
// unless the lockfile is unchanged since the last install. It reaches only nodejs.org and the npm
// registry, and needs no secret. What it prints, Claude reads.
//
// To move to a newer Node 24, change NODE and SHA256, the `linux-x64.tar.xz` line of
// https://nodejs.org/dist/<version>/SHASUMS256.txt.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NODE = 'v24.22.2';
const SHA256 = '48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

const root = join(import.meta.dirname, '..');
const home = `/opt/node-${NODE}`;
const bin = join(home, 'bin');
const stamp = join(root, 'node_modules', '.cloud-session.sha256');
// npm's output goes to stderr, so that only the outcome reaches Claude.
const quiet = { cwd: root, stdio: ['ignore', 2, 2] as ['ignore', number, number] };

function stop(problem: string): never {
  console.log(`Cloud session setup failed: ${problem}. Tell the person; \`npm test\` and \`npm run check\` need Node 24 and the dependencies.`);
  process.exit(0);
}

if (!existsSync(join(bin, 'node'))) {
  const tarball = `/tmp/node-${NODE}-linux-x64.tar.xz`;
  try {
    // curl, not fetch, because curl follows the session's proxy settings.
    execFileSync('curl', ['-fsSL', '-o', tarball, `https://nodejs.org/dist/${NODE}/node-${NODE}-linux-x64.tar.xz`], quiet);
  } catch {
    stop('nodejs.org could not be reached; the cloud environment\'s network access must allow it');
  }
  const digest = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  if (digest !== SHA256) stop(`the Node ${NODE} download's checksum is ${digest}, not ${SHA256}`);
  mkdirSync(home, { recursive: true });
  execFileSync('tar', ['-xJf', tarball, '-C', home, '--strip-components=1'], quiet);
  rmSync(tarball);
}

if (process.env.CLAUDE_ENV_FILE) appendFileSync(process.env.CLAUDE_ENV_FILE, `export PATH="${bin}:$PATH"\n`);

const inputs = createHash('sha256')
  .update(readFileSync(join(root, 'package-lock.json')))
  .update(readFileSync(import.meta.filename))
  .digest('hex');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== inputs) {
  rmSync(stamp, { force: true });
  try {
    execFileSync(join(bin, 'npm'), ['ci', '--no-audit', '--no-fund'], { ...quiet, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  } catch {
    stop('`npm ci` failed; its output is in the hook\'s stderr');
  }
  writeFileSync(stamp, inputs);
}

console.log(`Cloud session ready: Node ${NODE} is first on the path and the dependencies are installed.`);
