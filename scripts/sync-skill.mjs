#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { ROOT, log, readJson, repoByName, repoPath } from './lib/workspace.mjs';

const checkOnly = process.argv.includes('--check');
const docsRepo = repoByName('slice.js_docs');
const sourceSkillRoot = join(repoPath(docsRepo), 'skill');
const sourceManifestPath = join(sourceSkillRoot, 'manifest.json');
const targetSkillRoot = join(ROOT, '.opencode', 'skills', 'slice-js-developer');

function fail(message) {
  log.error(message);
  process.exitCode = 1;
}

function isSafeRelative(filePath) {
  return (
    typeof filePath === 'string' &&
    filePath.length > 0 &&
    !isAbsolute(filePath) &&
    !filePath.split(/[\\/]+/).includes('..')
  );
}

function walkFiles(root, prefix = '') {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...walkFiles(join(root, entry.name), rel));
    else if (entry.isFile()) result.push(rel);
  }
  return result;
}

function sourceDoc(version, targets) {
  return `# Vendored Slice.js developer skill

- **Canonical source:** \`repos/slice.js_docs/skill/slice-js-developer\`
- **Upstream:** \`https://github.com/VKneider/slicejs_docs/tree/master/skill/slice-js-developer\`
- **Vendored version:** \`${version}\`
- **Targets:** \`${targets}\`
- **Sync command:** \`pnpm sync:skill\`

Do not edit the files in this directory by hand. Edit the skill in the docs repository, update its
\`VERSION\` and \`skill/manifest.json\`, then run \`pnpm sync:skill\` from the workspace root and commit
the updated copy here.

This vendored copy exists so OpenCode can load the skill as \`slice-js-developer\` without network
access. The docs repository remains the single source of truth.
`;
}

if (!existsSync(sourceManifestPath)) {
  fail(
    `Skill manifest not found: ${sourceManifestPath}\n` +
      'The docs checkout is required to sync the skill. Run pnpm bootstrap --no-install first.',
  );
  process.exit(1);
}

const manifest = readJson(sourceManifestPath);
if (manifest.name !== 'slice-js-developer' || !manifest.version || !Array.isArray(manifest.files)) {
  fail(`Unexpected skill manifest shape in ${sourceManifestPath}.`);
  process.exit(1);
}
if (manifest.files.some((file) => !isSafeRelative(file))) {
  fail('The skill manifest contains an unsafe file path.');
  process.exit(1);
}

const sourceSkillDir = join(sourceSkillRoot, manifest.name);
if (!existsSync(join(sourceSkillDir, 'SKILL.md'))) {
  fail(`Skill source is missing SKILL.md: ${sourceSkillDir}`);
  process.exit(1);
}

if (checkOnly) {
  const problems = [];

  if (!existsSync(targetSkillRoot)) {
    problems.push(`missing vendored skill directory: ${targetSkillRoot}`);
  } else {
    for (const file of manifest.files) {
      const source = join(sourceSkillDir, file);
      const target = join(targetSkillRoot, file);
      if (!existsSync(source)) {
        problems.push(`manifest file missing in docs repo: ${file}`);
        continue;
      }
      if (!existsSync(target)) {
        problems.push(`missing in workspace: ${file}`);
        continue;
      }
      if (!readFileSync(source).equals(readFileSync(target))) {
        problems.push(`out of sync: ${file}`);
      }
    }

    const allowed = new Set([...manifest.files, 'SOURCE.md']);
    for (const file of walkFiles(targetSkillRoot)) {
      if (!allowed.has(file)) problems.push(`unexpected extra file: ${file}`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) log.warn(problem);
    log.error(
      `Vendored skill v${manifest.version} is out of sync with the docs repo. Run "pnpm sync:skill".`,
    );
    process.exitCode = 1;
  } else {
    log.ok(`Vendored skill v${manifest.version} is in sync with repos/slice.js_docs/skill.`);
  }
  process.exit();
}

for (const file of manifest.files) {
  const source = join(sourceSkillDir, file);
  const target = join(targetSkillRoot, file);
  if (!existsSync(source)) {
    fail(`Manifest file missing in docs repo: ${file}`);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

writeFileSync(join(targetSkillRoot, 'SOURCE.md'), sourceDoc(manifest.version, manifest.targets), 'utf8');

if (process.exitCode) process.exit();

log.ok(`Synced slice-js-developer v${manifest.version} (${manifest.targets})`);
log.info(`  from ${sourceSkillDir}`);
log.info(`  to   ${targetSkillRoot}`);
