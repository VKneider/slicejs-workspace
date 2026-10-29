import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const WORKSPACE = 'workspace';

export const AREA_REPO = Object.freeze({
  framework: 'slice.js',
  cli: 'slicejs-cli',
  components: 'slicejs-components',
  docs: 'slice.js_docs',
  mcp: 'slicejs-mcp',
  conclave: 'conclave',
  workspace: WORKSPACE,
  ecosystem: WORKSPACE,
});

export const AREAS = Object.freeze(Object.keys(AREA_REPO));
export const REPO_AREA = Object.freeze(
  Object.fromEntries(
    Object.entries(AREA_REPO).map(([area, repo]) => [repo, area === 'ecosystem' ? 'ecosystem' : area]),
  ),
);
export const PRIORITIES = Object.freeze(['low', 'medium', 'high']);
export const STATUSES = Object.freeze(['proposed', 'planned', 'in-progress', 'blocked', 'done', 'rejected']);
export const LIST_KEYS = Object.freeze(['repo', 'id', 'doc_id', 'title', 'status', 'area', 'priority', 'target']);
export const STALE_DAYS = 30;

const LIST_ITEM = /^\s+-\s+(.*)$/;

function unquote(value) {
  const text = String(value).trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

function parseInlineList(value) {
  return value
    .slice(1, -1)
    .split(',')
    .map((item) => unquote(item))
    .filter((item) => item !== '');
}

function parseScalar(value) {
  const text = String(value).trim();
  if (text.startsWith('[') && text.endsWith(']')) return parseInlineList(text);
  return unquote(text);
}

/**
 * Parses the YAML subset used by feature frontmatter. It intentionally does not
 * try to be a general YAML parser: scalars, quoted scalars, inline arrays and
 * block lists are enough for `NNNN-slug.md` files.
 */
export function parseFrontMatter(text) {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const data = {};
  let listKey = null;

  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(LIST_ITEM);
    if (item && listKey) {
      if (!Array.isArray(data[listKey])) data[listKey] = [];
      data[listKey].push(unquote(item[1]));
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      listKey = null;
      continue;
    }

    const key = line.slice(0, separator).trim();
    if (!key) {
      listKey = null;
      continue;
    }

    const rawValue = line.slice(separator + 1).trim();
    if (rawValue === '') {
      data[key] = '';
      listKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
    listKey = null;
  }

  return data;
}

export function stripFrontMatter(text) {
  return String(text).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function parseDate(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function toPosix(value) {
  return String(value).split('\\').join('/');
}

function featureWarnings({ data, sourceRepo, filenameId, status, area, priority, updated, today }) {
  const warnings = [];
  const add = (code, message) => warnings.push({ code, message });

  if (Object.keys(data).length === 0) {
    add('frontmatter-missing', 'The file has no frontmatter; every field falls back to defaults.');
  }

  if (data.id && data.id !== filenameId) {
    add('id-mismatch', `Frontmatter id "${data.id}" does not match the filename id "${filenameId}".`);
  }
  if (data.repo && data.repo !== sourceRepo) {
    add('repo-mismatch', `Frontmatter repo "${data.repo}" does not match the folder owner "${sourceRepo}".`);
  }
  if (!data.title) {
    add('title-missing', 'The frontmatter has no title; the filename slug is displayed instead.');
  }
  if (!STATUSES.includes(status)) {
    add('status-invalid', `Unknown status "${status}". Use one of: ${STATUSES.join(', ')}.`);
  }
  if (!AREAS.includes(area)) {
    add('area-invalid', `Unknown area "${area}". Use one of: ${AREAS.join(', ')}.`);
  }
  if (!PRIORITIES.includes(priority)) {
    add('priority-invalid', `Unknown priority "${priority}". Use one of: ${PRIORITIES.join(', ')}.`);
  }
  if (!data.created) {
    add('created-missing', 'The frontmatter has no created date.');
  } else if (!parseDate(data.created)) {
    add('created-invalid', `The created date "${data.created}" is not YYYY-MM-DD.`);
  }
  if (!updated) {
    add('updated-missing', 'The frontmatter has no updated date.');
  } else if (!parseDate(updated)) {
    add('updated-invalid', `The updated date "${updated}" is not YYYY-MM-DD.`);
  }

  const created = parseDate(data.created);
  const updatedDate = parseDate(updated);
  if (created && updatedDate && updatedDate < created) {
    add('updated-before-created', 'The updated date is earlier than the created date.');
  }

  const staleDays = updatedDate ? daysBetween(updatedDate, today) : null;
  const stale =
    staleDays !== null &&
    staleDays > STALE_DAYS &&
    ['proposed', 'planned', 'in-progress', 'blocked'].includes(status);
  if (stale) {
    add('stale', `Not updated in ${staleDays} days (threshold: ${STALE_DAYS}).`);
  }

  return { warnings, stale, staleDays };
}

function sources(root, repos, reposDir) {
  const result = [{ repo: WORKSPACE, dir: join(root, 'features') }];
  for (const repo of repos) {
    result.push({ repo: repo.dir, dir: join(root, reposDir, repo.dir, 'features') });
  }
  return result;
}

/**
 * Collects every feature file in the workspace and in the manifest repos.
 * The workspace `features/` folder only holds workspace/ecosystem features.
 */
export function collectFeatures({
  root,
  repos = [],
  reposDir = 'repos',
  today = new Date(),
} = {}) {
  const entries = [];

  for (const source of sources(root, repos, reposDir)) {
    if (!existsSync(source.dir)) continue;

    for (const name of readdirSync(source.dir)) {
      if (!/^\d{4}-.+\.md$/.test(name)) continue;

      const filePath = join(source.dir, name);
      const text = readFileSync(filePath, 'utf8');
      const data = parseFrontMatter(text);
      const filenameId = name.slice(0, 4);
      const id = data.id || filenameId;
      const repo = data.repo || source.repo;
      const status = data.status || 'proposed';
      const area = data.area || 'unknown';
      const priority = data.priority || 'unknown';
      const updated = data.updated || '';

      const { warnings, stale, staleDays } = featureWarnings({
        data,
        sourceRepo: source.repo,
        filenameId,
        status,
        area,
        priority,
        updated,
        today,
      });

      entries.push({
        repo,
        id,
        docId: `${repo}:${id}`,
        title: data.title || name.replace(/^\d{4}-/, '').replace(/\.md$/, ''),
        status,
        area,
        priority,
        target: data.target || 'TBD',
        created: data.created || '',
        updated,
        owners: Array.isArray(data.owners) ? data.owners : [],
        related: Array.isArray(data.related) ? data.related : [],
        dependsOn: Array.isArray(data.depends_on) ? data.depends_on.filter(Boolean) : [],
        blocks: Array.isArray(data.blocks) ? data.blocks.filter(Boolean) : [],
        sourceRepo: source.repo,
        path: filePath,
        relativePath: toPosix(relative(root, filePath)),
        body: stripFrontMatter(text),
        warnings,
        stale,
        staleDays,
      });
    }
  }

  validateDependencies(entries);

  return entries.sort(
    (left, right) => left.repo.localeCompare(right.repo) || left.id.localeCompare(right.id),
  );
}

/**
 * Adds warnings for bogus dependency references and cycles. `depends_on` is an
 * edge from this feature to the one it needs; `blocks` is the inverse edge
 * written on the blocking feature. Both are optional and only add warnings;
 * the lab/editor decides whether a transition is blocked.
 */
function validateDependencies(entries) {
  const byDocId = new Map(entries.map((entry) => [entry.docId, entry]));
  const graph = new Map(entries.map((entry) => [entry.docId, new Set()]));

  const addWarning = (entry, code, message) => {
    if (!entry.warnings.some((warning) => warning.code === code && warning.message === message)) {
      entry.warnings.push({ code, message });
    }
  };

  for (const entry of entries) {
    for (const ref of entry.dependsOn) {
      if (ref === entry.docId) {
        addWarning(entry, 'dependency-self', 'A feature cannot depend on itself.');
        continue;
      }
      if (!byDocId.has(ref)) {
        addWarning(entry, 'dependency-unknown', `depends_on points to "${ref}", which is not a known feature.`);
        continue;
      }
      graph.get(entry.docId)?.add(ref);
    }

    for (const ref of entry.blocks) {
      if (ref === entry.docId) {
        addWarning(entry, 'dependency-self', 'A feature cannot block itself.');
        continue;
      }
      if (!byDocId.has(ref)) {
        addWarning(entry, 'dependency-unknown', `blocks points to "${ref}", which is not a known feature.`);
        continue;
      }
      // If A blocks B, B depends on A.
      graph.get(ref)?.add(entry.docId);
    }
  }

  const state = new Map();
  const stack = [];
  const cyclic = new Set();

  const visit = (docId) => {
    const status = state.get(docId) || 0;
    if (status === 1) {
      const start = stack.indexOf(docId);
      if (start !== -1) {
        for (let index = start; index < stack.length; index += 1) cyclic.add(stack[index]);
      }
      return;
    }
    if (status === 2) return;
    state.set(docId, 1);
    stack.push(docId);
    for (const dependency of graph.get(docId) || []) visit(dependency);
    stack.pop();
    state.set(docId, 2);
  };

  for (const docId of graph.keys()) visit(docId);

  for (const docId of cyclic) {
    const entry = byDocId.get(docId);
    if (entry) addWarning(entry, 'dependency-cycle', 'This feature is part of a dependency cycle.');
  }
}

/** The stable shape of `pnpm feature:list --json`; keep it backward compatible. */
export function toListEntry(entry) {
  return {
    repo: entry.repo,
    id: entry.id,
    doc_id: entry.docId,
    title: entry.title,
    status: entry.status,
    area: entry.area,
    priority: entry.priority,
    target: entry.target,
  };
}
