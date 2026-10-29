#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { ROOT, log, manifest } from './lib/workspace.mjs';
import { collectFeatures } from './lib/features.mjs';
import { collectLinkHealth, collectRepoHealth, summarizeHealth } from './lib/health.mjs';
import { renderMarkdown } from './lib/markdown.mjs';
import { DASHBOARD_ASSETS, readDashboardAsset, renderDocument } from './lib/dashboard-page.mjs';

const DEFAULT_PORT = 4173;
const DEFAULT_HOST = '127.0.0.1';
const MAX_PORT_ATTEMPTS = 20;

function usage() {
  console.log(`Usage:
  pnpm dashboard                 Serve the dashboard on http://127.0.0.1:4173
  pnpm dashboard --open          Also open it in the default browser
  pnpm dashboard --port 4180     Use a specific port
  pnpm dashboard --json          Print the aggregated payload and exit
  pnpm dashboard --out [dir]     Write a static snapshot (default: .dashboard)

The dashboard is read-only. It reads feature frontmatter, workspace.config.json,
Git metadata and local link resolution. pnpm doctor remains the source of truth.`);
}

function parseArgs(argv) {
  const options = {
    json: false,
    out: null,
    port: DEFAULT_PORT,
    portExplicit: false,
    host: DEFAULT_HOST,
    open: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const separator = arg.indexOf('=');
    const name = separator === -1 ? arg : arg.slice(0, separator);
    const inline = separator === -1 ? undefined : arg.slice(separator + 1);
    const takeValue = () => {
      if (inline !== undefined) return inline;
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('-')) {
        index += 1;
        return next;
      }
      return undefined;
    };

    switch (name) {
      case '--json':
        options.json = true;
        break;
      case '--open':
        options.open = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--out': {
        const value = takeValue();
        options.out = value || '.dashboard';
        break;
      }
      case '--port': {
        const value = takeValue();
        if (value === undefined) throw new Error('--port needs a value.');
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65_535) {
          throw new Error(`Invalid port "${value}".`);
        }
        options.port = port;
        options.portExplicit = true;
        break;
      }
      case '--host': {
        const value = takeValue();
        if (!value) throw new Error('--host needs a value.');
        options.host = value;
        break;
      }
      default:
        throw new Error(`Unknown option "${arg}". Run pnpm dashboard --help.`);
    }
  }

  return options;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item[key] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function buildData() {
  const features = collectFeatures({
    root: ROOT,
    repos: manifest.repos,
    reposDir: manifest.reposDir,
  }).map((feature) => ({
    ...feature,
    bodyHtml: renderMarkdown(feature.body),
  }));

  const repos = manifest.repos.map((repo) => collectRepoHealth(repo));
  const links = collectLinkHealth(manifest);
  const health = summarizeHealth(repos, links);

  return {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    summary: {
      features: {
        total: features.length,
        byStatus: countBy(features, 'status'),
        byArea: countBy(features, 'area'),
        byPriority: countBy(features, 'priority'),
        stale: features.filter((feature) => feature.stale).length,
        warnings: features.reduce((total, feature) => total + feature.warnings.length, 0),
      },
      repos: health.repos,
      links: health.links,
    },
    features,
    repos,
    links,
  };
}

function send(response, status, type, body) {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(body);
}

function handleRequest(request, response) {
  try {
    const url = new URL(request.url || '/', 'http://localhost');

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const data = buildData();
      send(response, 200, 'text/html; charset=utf-8', renderDocument(data, { prefix: '/' }));
      return;
    }

    if (url.pathname === '/api/data') {
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify(buildData(), null, 2));
      return;
    }

    if (url.pathname === '/healthz') {
      send(response, 200, 'text/plain; charset=utf-8', 'ok');
      return;
    }

    if (DASHBOARD_ASSETS[url.pathname]) {
      const content = readDashboardAsset(url.pathname);
      const type = url.pathname.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8';
      send(response, 200, type, content);
      return;
    }

    send(response, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    send(response, 500, 'text/plain; charset=utf-8', `Dashboard error: ${error.stack || error.message}`);
  }
}

function listen(host, startPort, portExplicit) {
  return new Promise((resolveServer, reject) => {
    let attempt = 0;

    const tryPort = (port) => {
      const server = createServer(handleRequest);

      const onError = (error) => {
        server.removeListener('listening', onListening);
        if (error.code === 'EADDRINUSE' && !portExplicit && attempt < MAX_PORT_ATTEMPTS) {
          attempt += 1;
          tryPort(startPort + attempt);
          return;
        }
        reject(error);
      };

      const onListening = () => {
        server.removeListener('error', onError);
        const address = server.address();
        resolveServer({ server, port: typeof address === 'object' && address ? address.port : port });
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    };

    tryPort(startPort);
  });
}

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? { file: 'cmd', args: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { file: 'open', args: [url] }
        : { file: 'xdg-open', args: [url] };

  try {
    const child = spawn(command.file, command.args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch {
    log.warn(`Could not open the browser automatically; open ${url} manually.`);
  }
}

function writeStatic(out, data) {
  const target = resolve(ROOT, out);
  mkdirSync(target, { recursive: true });

  writeFileSync(join(target, 'index.html'), renderDocument(data, { prefix: '' }), 'utf8');
  writeFileSync(join(target, 'data.json'), JSON.stringify(data, null, 2), 'utf8');
  writeFileSync(join(target, 'app.css'), readDashboardAsset('/app.css'), 'utf8');
  writeFileSync(join(target, 'app.js'), readDashboardAsset('/app.js'), 'utf8');

  return target;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    log.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    usage();
    return;
  }

  if (options.out) {
    const target = writeStatic(options.out, buildData());
    log.ok(`Static dashboard written to ${target}`);
    log.info(`Open ${join(target, 'index.html')}`);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(buildData(), null, 2));
    return;
  }

  const { server, port } = await listen(options.host, options.port, options.portExplicit);
  const url = `http://${options.host}:${port}/`;
  log.ok(`Dashboard at ${url}`);
  log.info('Read-only. Press Ctrl+C to stop.');

  if (options.open) openBrowser(url);

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  log.error(error.stack || error.message);
  process.exitCode = 1;
});
