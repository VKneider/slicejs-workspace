#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, manifest, log, repoByName, repoPath } from './lib/workspace.mjs';

const WORKSPACE = 'workspace';
const AREA_REPO = {
  framework: 'slice.js',
  cli: 'slicejs-cli',
  components: 'slicejs-components',
  docs: 'slice.js_docs',
  mcp: 'slicejs-mcp',
  conclave: 'conclave',
  workspace: WORKSPACE,
  ecosystem: WORKSPACE,
};
const REPO_AREA = Object.fromEntries(
  Object.entries(AREA_REPO).map(([area, repo]) => [repo, area === 'ecosystem' ? 'ecosystem' : area]),
);
const AREAS = new Set(Object.keys(AREA_REPO));
const PRIORITIES = new Set(['low', 'medium', 'high']);
const STATUSES = new Set(['proposed', 'planned', 'in-progress', 'blocked', 'done', 'rejected']);

const args = process.argv.slice(2);
const command = args[0] || 'list';

function usage() {
  console.log(`Usage:
  pnpm feature:new "Title" --area framework [--priority high] [--target 4.1]
  pnpm feature:new "Title" --repo slicejs-cli [--area cli]
  pnpm feature:list [--repo slice.js] [--status planned] [--area cli] [--json]

Repo is inferred from --area; use --repo to override.
Areas:      ${[...AREAS].join(', ')}
Priorities: ${[...PRIORITIES].join(', ')}
Statuses:   ${[...STATUSES].join(', ')}`);
}

function parseOptions(rest) {
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=', 2);
      const value = inline !== undefined ? inline : rest[index + 1];
      if (inline === undefined && value !== undefined && !value.startsWith('--')) index += 1;
      options[name] = value ?? true;
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function normalizeRepo(value) {
  if (!value || value === WORKSPACE) return WORKSPACE;
  const repo = manifest.repos.find((item) => item.dir === value || item.name === value);
  if (!repo) {
    throw new Error(`Unknown repo "${value}". Use one of: ${[WORKSPACE, ...manifest.repos.map((item) => item.dir)].join(', ')}.`);
  }
  return repo.dir;
}

function resolveRepo(options) {
  if (options.repo) return normalizeRepo(String(options.repo));
  const area = options.area ? String(options.area) : 'framework';
  if (!AREAS.has(area)) {
    throw new Error(`Unknown area "${area}". Use one of: ${[...AREAS].join(', ')}.`);
  }
  return AREA_REPO[area];
}

function featuresDir(repo) {
  return repo === WORKSPACE ? join(ROOT, 'features') : join(repoPath(repoByName(repo)), 'features');
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'feature';
}

function yamlQuote(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextId(dir) {
  if (!existsSync(dir)) return '0001';
  const ids = readdirSync(dir)
    .map((name) => name.match(/^(\d{4})-.+\.md$/))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return String((ids.length ? Math.max(...ids) : 0) + 1).padStart(4, '0');
}

function newFeature(rest) {
  const { options, positional } = parseOptions(rest);
  const title = positional.join(' ').trim();
  if (!title) {
    usage();
    process.exitCode = 1;
    return;
  }

  let repo;
  try {
    repo = resolveRepo(options);
  } catch (error) {
    log.error(error.message);
    process.exitCode = 1;
    return;
  }

  const area = String(options.area || REPO_AREA[repo] || 'framework');
  const priority = String(options.priority || 'medium');
  if (!AREAS.has(area)) {
    log.error(`Unknown area "${area}". Use one of: ${[...AREAS].join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  if (!PRIORITIES.has(priority)) {
    log.error(`Unknown priority "${priority}". Use one of: ${[...PRIORITIES].join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  if (repo !== WORKSPACE && !existsSync(repoPath(repo))) {
    log.error(`Repo "${repo}" is not cloned. Run pnpm bootstrap first.`);
    process.exitCode = 1;
    return;
  }

  const templatePath = join(ROOT, 'features', '_TEMPLATE.md');
  if (!existsSync(templatePath)) {
    log.error(`Feature template not found: ${templatePath}`);
    process.exitCode = 1;
    return;
  }

  const dir = featuresDir(repo);
  mkdirSync(dir, { recursive: true });
  const id = nextId(dir);
  const filePath = join(dir, `${id}-${slugify(title)}.md`);
  if (existsSync(filePath)) {
    log.error(`Feature already exists: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const date = today();
  const target = String(options.target || 'TBD');
  const template = readFileSync(templatePath, 'utf8');
  const content = template
    .replaceAll('{{id}}', id)
    .replaceAll('{{title}}', yamlQuote(title))
    .replaceAll('{{repo}}', yamlQuote(repo))
    .replaceAll('{{area}}', area)
    .replaceAll('{{priority}}', priority)
    .replaceAll('{{date}}', date)
    .replaceAll('{{target}}', yamlQuote(target));

  writeFileSync(filePath, content, 'utf8');
  const relativePath = filePath.startsWith(ROOT) ? filePath.slice(ROOT.length + 1) : filePath;
  log.ok(`Created ${relativePath}`);
  log.info(`Repo: ${repo}  Area: ${area}  Status: proposed`);
  log.info('Next: fill in Summary, Problem, Proposed direction and Scope. Commit it in the owning repo.');
}

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    data[key] = value;
  }
  return data;
}

function listFeatures(rest) {
  const { options } = parseOptions(rest);
  let repoFilter = null;
  if (options.repo) {
    try {
      repoFilter = normalizeRepo(String(options.repo));
    } catch (error) {
      log.error(error.message);
      process.exitCode = 1;
      return;
    }
  }
  const status = options.status ? String(options.status) : null;
  const area = options.area ? String(options.area) : null;

  const sources = [{ repo: WORKSPACE, dir: join(ROOT, 'features') }];
  for (const repo of manifest.repos) {
    sources.push({ repo: repo.dir, dir: join(reposRootFor(repo), 'features') });
  }

  const entries = [];
  for (const source of sources) {
    if (repoFilter && source.repo !== repoFilter) continue;
    if (!existsSync(source.dir)) continue;
    for (const name of readdirSync(source.dir)) {
      if (!/^\d{4}-.+\.md$/.test(name)) continue;
      const data = parseFrontMatter(readFileSync(join(source.dir, name), 'utf8'));
      entries.push({
        repo: data.repo || source.repo,
        id: data.id || name.slice(0, 4),
        doc_id: `${data.repo || source.repo}:${data.id || name.slice(0, 4)}`,
        title: data.title || name.replace(/^\d{4}-/, '').replace(/\.md$/, ''),
        status: data.status || 'proposed',
        area: data.area || 'unknown',
        priority: data.priority || 'unknown',
        target: data.target || 'TBD',
      });
    }
  }

  const filtered = entries
    .filter((entry) => (!status || entry.status === status) && (!area || entry.area === area))
    .sort((left, right) => left.repo.localeCompare(right.repo) || left.id.localeCompare(right.id));

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (filtered.length === 0) {
    log.info(`No features match${status ? ` status=${status}` : ''}${area ? ` area=${area}` : ''}${repoFilter ? ` repo=${repoFilter}` : ''}.`);
    return;
  }

  const columns = [
    { key: 'repo', label: 'repo', width: 20 },
    { key: 'id', label: 'id', width: 5 },
    { key: 'status', label: 'status', width: 12 },
    { key: 'area', label: 'area', width: 11 },
    { key: 'priority', label: 'priority', width: 9 },
    { key: 'target', label: 'target', width: 10 },
    { key: 'title', label: 'title', width: 48 },
  ];
  const pad = (value, width) => String(value).padEnd(width, ' ').slice(0, width);
  console.log(columns.map((column) => pad(column.label, column.width)).join(' '));
  console.log(columns.map((column) => '-'.repeat(column.width)).join(' '));
  for (const entry of filtered) {
    console.log(columns.map((column) => pad(entry[column.key], column.width)).join(' '));
  }
}

function reposRootFor(repo) {
  return join(ROOT, manifest.reposDir || 'repos', repo.dir);
}

mkdirSync(join(ROOT, 'features'), { recursive: true });

if (command === 'new') {
  newFeature(args.slice(1));
} else if (command === 'list') {
  listFeatures(args.slice(1));
} else if (command === 'help' || command === '--help' || command === '-h') {
  usage();
} else {
  log.error(`Unknown command "${command}".`);
  usage();
  process.exitCode = 1;
}
