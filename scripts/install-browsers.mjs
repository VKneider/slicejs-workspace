#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { log, repoByName, repoPath } from './lib/workspace.mjs';

const targets = [
  {
    repo: 'slice.js_visual_library',
    label: 'visual library (project-local browsers)',
    env: { PLAYWRIGHT_BROWSERS_PATH: '0' },
  },
  {
    repo: 'conclave',
    label: 'Conclave (machine cache)',
    env: {},
  },
];

let failed = 0;

for (const target of targets) {
  const dir = repoPath(repoByName(target.repo));
  const cli = join(dir, 'node_modules', '@playwright', 'test', 'cli.js');

  log.step(`${target.label}`);

  if (!existsSync(cli)) {
    log.error(`${target.repo}: Playwright is not installed. Run pnpm install from the workspace root.`);
    failed += 1;
    continue;
  }

  const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
    cwd: dir,
    env: { ...process.env, ...target.env },
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    log.error(`${target.repo}: ${result.error.message}`);
    failed += 1;
  } else if (result.status !== 0) {
    log.error(`${target.repo}: playwright install exited with ${result.status}.`);
    failed += 1;
  } else {
    log.ok(`${target.repo}: Chromium ready`);
  }
}

if (failed > 0) {
  log.error(`\n${failed} browser installation(s) failed.`);
  process.exitCode = 1;
} else {
  log.ok('\nPlaywright Chromium is ready for the e2e suites.');
}
