#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ROOT,
  delay,
  findFreePort,
  isInside,
  isWindows,
  log,
  realpathOrNull,
  repoByName,
  repoPath,
  resolveFrom,
} from './lib/workspace.mjs';

const verbose = process.argv.includes('--verbose');
const conclave = repoByName('conclave');
const framework = repoByName('slice.js');
const cli = repoByName('slicejs-cli');

const conclaveDir = repoPath(conclave);
const frameworkDir = repoPath(framework);
const cliDir = repoPath(cli);
const cliEntry = join(cliDir, 'client.js');
const runtimePath = join(frameworkDir, 'Slice', 'Slice.js');

let child = null;
let stopped = false;
let output = '';

function fail(message) {
  throw new Error(message);
}

function appendOutput(chunk) {
  output += chunk;
  if (output.length > 200_000) output = output.slice(-100_000);
  if (verbose) process.stdout.write(chunk);
}

function tailOutput(lines = 80) {
  return output.trimEnd().split('\n').slice(-lines).join('\n');
}

async function stop() {
  if (stopped || !child || child.exitCode !== null) return;
  stopped = true;

  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }

  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    delay(5_000),
  ]);
}

async function waitFor(url, deadline) {
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`The dev server exited early with code ${child.exitCode}.\n${tailOutput()}`);
    }
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'slice-workspace-verify/1.0' },
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(400);
  }
  fail(`Timed out waiting for ${url}.${lastError ? ` Last error: ${lastError.message}` : ''}\n${tailOutput()}`);
}

async function main() {
  if (!existsSync(join(conclaveDir, '.git'))) fail('repos/conclave is missing. Run pnpm bootstrap.');
  if (!existsSync(join(conclaveDir, 'node_modules'))) {
    fail('repos/conclave/node_modules is missing. Run pnpm install from the workspace root.');
  }
  if (!existsSync(cliEntry)) fail('repos/slicejs-cli/client.js is missing. Run pnpm bootstrap.');
  if (!existsSync(runtimePath)) fail(`Local framework runtime not found: ${runtimePath}`);

  const frameworkResolution = realpathOrNull(resolveFrom(conclaveDir, 'slicejs-web-framework'));
  if (!frameworkResolution || !isInside(frameworkDir, frameworkResolution)) {
    fail(
      `Conclave does not resolve the local framework.\n  expected under: ${frameworkDir}\n  resolved:       ${frameworkResolution ?? '(unresolved)'}\n  Fix: run "pnpm install" from ${ROOT}, then "pnpm doctor".`,
    );
  }
  const cliResolution = realpathOrNull(resolveFrom(conclaveDir, 'slicejs-cli'));
  if (!cliResolution || !isInside(cliDir, cliResolution)) {
    fail(
      `Conclave does not resolve the local CLI.\n  expected under: ${cliDir}\n  resolved:       ${cliResolution ?? '(unresolved)'}\n  Fix: run "pnpm install" from ${ROOT}, then "pnpm doctor".`,
    );
  }

  const port = Number(process.env.VERIFY_PORT) || (await findFreePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const localRuntime = await readFile(runtimePath, 'utf8');
  const localHash = createHash('sha256').update(localRuntime).digest('hex');

  log.step(`Starting Conclave on ${baseUrl}`);
  log.info(`  framework: ${frameworkResolution}`);
  log.info(`  cli:       ${cliResolution}`);

  child = spawn(process.execPath, [cliEntry, 'dev', '--port', String(port)], {
    cwd: conclaveDir,
    env: {
      ...process.env,
      INIT_CWD: conclaveDir,
      PORT: String(port),
      NODE_ENV: 'development',
      SLICE_NO_LOCAL_DELEGATION: '1',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => appendOutput(chunk.toString()));
  child.stderr.on('data', (chunk) => appendOutput(chunk.toString()));

  const deadline = Date.now() + 120_000;
  await waitFor(`${baseUrl}/api/status`, deadline);
  log.ok('Conclave responded on /api/status');

  const runtimeResponse = await fetch(`${baseUrl}/Slice/Slice.js`, {
    headers: { 'user-agent': 'slice-workspace-verify/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!runtimeResponse.ok) fail(`/Slice/Slice.js returned HTTP ${runtimeResponse.status}.`);
  const servedRuntime = await runtimeResponse.text();

  if (servedRuntime !== localRuntime) {
    const servedHash = createHash('sha256').update(servedRuntime).digest('hex');
    fail(
      `The served runtime does not match the local source.\n  local:  ${localHash} (${localRuntime.length} bytes)\n  served: ${servedHash} (${servedRuntime.length} bytes)\n` +
        'The app is probably serving a stale dist/ copy, or the link is not active. Run pnpm doctor and rebuild if needed.',
    );
  }
  log.ok(`/Slice/Slice.js matches repos/slice.js (${localRuntime.length} bytes, sha256 ${localHash.slice(0, 12)}…)`);

  const indexResponse = await fetch(`${baseUrl}/`, {
    headers: { 'user-agent': 'slice-workspace-verify/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!indexResponse.ok) fail(`/ returned HTTP ${indexResponse.status}.`);
  const indexHtml = await indexResponse.text();
  if (!indexHtml.includes('/App/index.js')) {
    fail('The app shell loaded, but it does not reference /App/index.js. Unexpected bootstrap HTML.');
  }
  log.ok('Conclave served the application shell');

  const envResponse = await fetch(`${baseUrl}/slice-env.json`, {
    headers: { 'user-agent': 'slice-workspace-verify/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!envResponse.ok) fail(`/slice-env.json returned HTTP ${envResponse.status}.`);
  log.ok('/slice-env.json responded');

  log.step('Result');
  log.ok('Conclave is running against the local Slice.js source.');
}

process.once('SIGINT', async () => {
  await stop();
  process.exit(130);
});

try {
  await main();
} catch (error) {
  log.step('Result');
  log.error(error.message);
  process.exitCode = 1;
} finally {
  await stop();
}
