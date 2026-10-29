(function () {
  'use strict';

  var DATA = window.__DASHBOARD_DATA__;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var STATUSES = ['proposed', 'planned', 'in-progress', 'blocked', 'done', 'rejected'];
  var STATUS_LABELS = {
    proposed: 'Proposed',
    planned: 'Planned',
    'in-progress': 'In progress',
    blocked: 'Blocked',
    done: 'Done',
    rejected: 'Rejected',
  };
  var STATUS_RANK = { 'in-progress': 0, planned: 1, proposed: 2, blocked: 3, done: 4, rejected: 5 };
  var state = { status: 'all', area: 'all', repo: 'all', priority: 'all', search: '' };
  var toastTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status;
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) return esc(value);
    return date.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function relativeAge(value) {
    if (!value) return '';
    var date = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) return '';
    var days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    var months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : months + ' months ago';
  }

  function statusMark(status) {
    return '<span class="status-mark status-' + esc(status) + '" aria-hidden="true"></span>';
  }

  function staleBadge(feature) {
    if (!feature.stale) return '';
    return '<span class="stale-flag" title="Not updated in ' + feature.staleDays + ' days">stale</span>';
  }

  function featureSearchText(feature) {
    return [feature.title, feature.docId, feature.repo, feature.area, feature.target, feature.body]
      .join(' ')
      .toLowerCase();
  }

  function filteredFeatures() {
    var term = state.search.trim().toLowerCase();
    return DATA.features
      .filter(function (feature) {
        return (
          (state.status === 'all' || feature.status === state.status) &&
          (state.area === 'all' || feature.area === state.area) &&
          (state.repo === 'all' || feature.repo === state.repo) &&
          (state.priority === 'all' || feature.priority === state.priority) &&
          (!term || featureSearchText(feature).indexOf(term) !== -1)
        );
      })
      .sort(function (left, right) {
        var byStatus = (STATUS_RANK[left.status] == null ? 9 : STATUS_RANK[left.status]) -
          (STATUS_RANK[right.status] == null ? 9 : STATUS_RANK[right.status]);
        if (byStatus !== 0) return byStatus;
        return String(right.updated).localeCompare(String(left.updated)) ||
          left.docId.localeCompare(right.docId);
      });
  }

  function options(values, selected) {
    return values
      .map(function (value) {
        var label = value === 'all' ? 'All' : value;
        return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' +
          esc(label) + '</option>';
      })
      .join('');
  }

  function buildShell() {
    var areas = Object.keys(DATA.summary.features.byArea).sort();
    var repos = DATA.repos.map(function (repo) { return repo.dir; });

    app.innerHTML =
      '<div class="shell">' +
        '<aside class="rail">' +
          '<div class="rail-head">' +
            '<span class="brand-mark" aria-hidden="true">' +
              '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6">' +
                '<path d="M6 9.5 16 4l10 5.5L16 15 6 9.5Z"></path>' +
                '<path d="M6 16 16 21.5 26 16"></path>' +
                '<path d="M6 22.5 16 28l10-5.5"></path>' +
              '</svg>' +
            '</span>' +
            '<span class="brand-text"><span class="brand-name">Slice.js</span>' +
              '<span class="brand-sub">workspace ledger</span></span>' +
          '</div>' +

          '<section class="rail-block">' +
            '<div class="rail-block-head"><h2>Repositories</h2><span class="rail-count" id="repo-summary"></span></div>' +
            '<div class="repo-list" id="repos"></div>' +
          '</section>' +

          '<section class="rail-block rail-links">' +
            '<div class="rail-block-head"><h2>Link integrity</h2><span class="rail-count" id="link-summary"></span></div>' +
            '<div class="link-list" id="links"></div>' +
          '</section>' +

          '<div class="rail-foot">' +
            '<button class="btn btn-quiet" id="reload" type="button">Reload</button>' +
            '<span class="rail-time">Generated <time id="generated"></time></span>' +
            '<code class="rail-root" id="rail-root"></code>' +
          '</div>' +
        '</aside>' +

        '<main class="main">' +
          '<header class="page-head">' +
            '<div class="head-top">' +
              '<h1>Feature ledger</h1>' +
              '<p class="lede">Every spec in the Slice.js workspace, with the state of the repository that owns it.</p>' +
            '</div>' +
            '<div class="summary" id="summary">' +
              '<div class="summary-count"><span class="summary-number" id="feature-total">0</span>' +
                '<span class="summary-label">specs</span></div>' +
              '<div class="summary-chart"><div class="dist-bar" id="dist-bar" role="img"></div>' +
                '<div class="dist-legend" id="dist-legend"></div></div>' +
              '<div class="summary-health" id="summary-health"></div>' +
            '</div>' +
          '</header>' +

          '<section class="filters" aria-label="Filter the ledger">' +
            '<div class="search-wrap">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
                '<circle cx="11" cy="11" r="6.5"></circle><path d="m19.5 19.5-3.8-3.8"></path>' +
              '</svg>' +
              '<input class="search" id="search" type="search" placeholder="Search specs" ' +
                'aria-label="Search specs" autocomplete="off" />' +
            '</div>' +
            '<select class="select" id="status-filter" aria-label="Filter by status">' +
              '<option value="all">All statuses</option>' + options(STATUSES, state.status) +
            '</select>' +
            '<select class="select" id="area-filter" aria-label="Filter by area">' +
              '<option value="all">All areas</option>' + options(areas, state.area) +
            '</select>' +
            '<select class="select" id="repo-filter" aria-label="Filter by repository">' +
              '<option value="all">All repositories</option>' + options(repos, state.repo) +
            '</select>' +
            '<select class="select" id="priority-filter" aria-label="Filter by priority">' +
              '<option value="all">All priorities</option>' + options(['high', 'medium', 'low'], state.priority) +
            '</select>' +
            '<button class="btn btn-quiet" id="clear" type="button">Clear</button>' +
            '<span class="result-count" id="result-count" aria-live="polite"></span>' +
          '</section>' +

          '<section class="ledger" aria-labelledby="ledger-title">' +
            '<div class="ledger-head"><h2 id="ledger-title">Specs</h2>' +
              '<span class="ledger-hint">Select a row to read the full spec</span></div>' +
            '<div class="table-wrap">' +
              '<table class="ledger-table">' +
                '<thead><tr>' +
                  '<th scope="col">Status</th><th scope="col">Spec</th><th scope="col">Repo</th>' +
                  '<th scope="col">Area</th><th scope="col">Priority</th><th scope="col">Updated</th>' +
                  '<th scope="col"><span class="visually-hidden">Warnings</span></th>' +
                '</tr></thead>' +
                '<tbody id="feature-rows"></tbody>' +
              '</table>' +
            '</div>' +
            '<div class="empty" id="empty" hidden></div>' +
          '</section>' +
        '</main>' +
      '</div>' +
      '<dialog class="sheet" id="detail"></dialog>' +
      '<div class="toast" id="toast" role="status"></div>';

    document.getElementById('reload').addEventListener('click', function () { location.reload(); });
    document.getElementById('search').addEventListener('input', function (event) {
      state.search = event.target.value;
      renderTable();
    });
    document.getElementById('status-filter').addEventListener('change', function (event) {
      state.status = event.target.value;
      renderAll();
    });
    document.getElementById('area-filter').addEventListener('change', function (event) {
      state.area = event.target.value;
      renderAll();
    });
    document.getElementById('repo-filter').addEventListener('change', function (event) {
      state.repo = event.target.value;
      renderAll();
    });
    document.getElementById('priority-filter').addEventListener('change', function (event) {
      state.priority = event.target.value;
      renderAll();
    });
    document.getElementById('clear').addEventListener('click', clearFilters);

    document.getElementById('feature-rows').addEventListener('click', function (event) {
      var row = event.target.closest('tr[data-doc]');
      if (row) openFeature(row.getAttribute('data-doc'));
    });

    document.getElementById('repos').addEventListener('click', function (event) {
      var button = event.target.closest('.repo');
      if (!button) return;
      var repo = button.getAttribute('data-repo');
      state.repo = state.repo === repo ? 'all' : repo;
      document.getElementById('repo-filter').value = state.repo;
      renderAll();
    });

    var detailDialog = document.getElementById('detail');
    detailDialog.addEventListener('click', function (event) {
      if (event.target === detailDialog) detailDialog.close();
    });

    document.addEventListener('keydown', function (event) {
      var tag = (event.target.tagName || '').toLowerCase();
      if (event.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        event.preventDefault();
        document.getElementById('search').focus();
      }
    });
  }

  function setStatus(status) {
    state.status = state.status === status ? 'all' : status;
    document.getElementById('status-filter').value = state.status;
    renderAll();
  }

  function renderSummary() {
    var summary = DATA.summary;
    var counts = summary.features.byStatus;

    document.getElementById('feature-total').textContent = summary.features.total;
    document.getElementById('generated').textContent = new Date(DATA.generatedAt).toLocaleString('en', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    var root = document.getElementById('rail-root');
    root.textContent = DATA.root;
    root.title = DATA.root;

    var present = STATUSES.filter(function (status) { return (counts[status] || 0) > 0; });
    var bar = document.getElementById('dist-bar');
    bar.innerHTML = present.length
      ? present.map(function (status) {
        return '<span class="dist-seg status-' + esc(status) + '" style="flex:' + counts[status] + ' 1 0" ' +
          'title="' + esc(statusLabel(status)) + ': ' + counts[status] + '"></span>';
      }).join('')
      : '<span class="dist-empty"></span>';
    bar.setAttribute('aria-label', present.length
      ? present.map(function (status) { return statusLabel(status) + ': ' + counts[status]; }).join(', ')
      : 'No specs');

    var legend = document.getElementById('dist-legend');
    legend.innerHTML = STATUSES.map(function (status) {
      var count = counts[status] || 0;
      return '<button class="legend-item' + (state.status === status ? ' is-active' : '') +
        (count === 0 ? ' is-zero' : '') + '" type="button" data-status="' + esc(status) + '" ' +
        'aria-pressed="' + (state.status === status ? 'true' : 'false') + '">' +
        statusMark(status) + '<span>' + esc(statusLabel(status)) + '</span>' +
        '<strong>' + count + '</strong></button>';
    }).join('');
    legend.querySelectorAll('[data-status]').forEach(function (button) {
      button.addEventListener('click', function () {
        setStatus(button.getAttribute('data-status'));
      });
    });

    var repos = summary.repos;
    var links = summary.links;
    var health = document.getElementById('summary-health');
    health.innerHTML =
      '<span><strong>' + repos.ok + '</strong> of ' + repos.total + ' repos clean</span>' +
      (repos.warn ? '<span class="is-warn"><strong>' + repos.warn + '</strong> with changes</span>' : '') +
      (repos.error ? '<span class="is-error"><strong>' + repos.error + '</strong> repo errors</span>' : '') +
      '<span><strong>' + links.ok + '</strong> of ' + links.total + ' links resolved</span>' +
      (links.warn ? '<span class="is-warn"><strong>' + links.warn + '</strong> link warnings</span>' : '') +
      (links.error ? '<span class="is-error"><strong>' + links.error + '</strong> link errors</span>' : '');

    document.getElementById('repo-summary').textContent = repos.ok + '/' + repos.total + ' clean';
    document.getElementById('link-summary').textContent = links.ok + '/' + links.total + ' ok';
  }

  function renderTable() {
    var features = filteredFeatures();
    var rows = document.getElementById('feature-rows');
    var empty = document.getElementById('empty');

    rows.innerHTML = features.map(function (feature) {
      var warningCount = feature.warnings.length;
      var warningTitle = feature.warnings.map(function (warning) { return warning.message; }).join('\n');
      return '<tr data-doc="' + esc(feature.docId) + '">' +
        '<td class="cell-status">' + statusMark(feature.status) +
          '<span class="status-text">' + esc(statusLabel(feature.status)) + '</span></td>' +
        '<td class="cell-spec">' +
          '<button class="spec-link" type="button" data-doc="' + esc(feature.docId) + '">' +
            esc(feature.title) + '</button>' +
          '<span class="spec-id">' + esc(feature.docId) + '</span></td>' +
        '<td class="cell-repo">' + esc(feature.repo) + '</td>' +
        '<td class="cell-area">' + esc(feature.area) + '</td>' +
        '<td class="cell-priority"><span class="priority priority-' + esc(feature.priority) + '">' +
          esc(feature.priority) + '</span></td>' +
        '<td class="cell-updated"><time datetime="' + esc(feature.updated) + '">' +
          formatDate(feature.updated) + '</time>' +
          '<span class="ago">' + esc(relativeAge(feature.updated)) + '</span>' +
          staleBadge(feature) + '</td>' +
        '<td class="cell-warn">' + (warningCount
          ? '<span class="warn-count" title="' + esc(warningTitle) + '">' + warningCount + '</span>'
          : '') + '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('result-count').textContent =
      features.length + ' of ' + DATA.features.length + ' shown';

    empty.hidden = features.length !== 0;
    if (features.length === 0) {
      empty.innerHTML = DATA.features.length === 0
        ? '<p class="empty-title">The ledger is empty.</p>' +
          '<p class="empty-copy">Capture the first spec with the CLI; the dashboard picks it up on reload.</p>' +
          '<code>pnpm feature:new "Title" --area framework</code>'
        : '<p class="empty-title">No specs match these filters.</p>' +
          '<p class="empty-copy">Try a different status, area, repo or search term.</p>' +
          '<button class="btn" type="button" data-clear>Clear filters</button>';
      var clear = empty.querySelector('[data-clear]');
      if (clear) clear.addEventListener('click', clearFilters);
    }
  }

  function renderRepos() {
    var container = document.getElementById('repos');
    container.innerHTML = DATA.repos.map(function (repo) {
      var dirty = repo.dirtyCount === 0 ? 'clean' : repo.dirtyCount + ' changed';
      var upstream = repo.ahead == null ? 'no upstream' : '+' + repo.ahead + '/' + repo.behind;
      var alerts = repo.issues.filter(function (issue) { return issue.severity !== 'info'; }).length;
      var issueText = repo.issues.map(function (issue) { return issue.message; }).join('\n');
      var branch = repo.branch || '(detached)';
      return '<button class="repo status-' + esc(repo.status) + (state.repo === repo.dir ? ' is-active' : '') +
        '" type="button" data-repo="' + esc(repo.dir) + '" aria-pressed="' + (state.repo === repo.dir ? 'true' : 'false') + '"' +
        ' title="' + esc((repo.lastCommit || 'No commits') + '\n' + issueText) + '">' +
        '<span class="repo-line"><span class="repo-name">' + esc(repo.dir) + '</span>' +
          '<span class="repo-role">' + esc(repo.role) + '</span></span>' +
        '<span class="repo-meta"><span>v' + esc(repo.version) + '</span>' +
          '<span class="mono">' + esc(branch) + '</span>' +
          '<span>' + esc(dirty) + '</span>' +
          '<span class="mono">' + esc(upstream) + '</span>' +
          (alerts ? '<span class="repo-alert">' + alerts + '</span>' : '') + '</span>' +
      '</button>';
    }).join('');
  }

  function renderLinks() {
    var container = document.getElementById('links');
    container.innerHTML = DATA.links.map(function (link) {
      var name = link.package || link.consumer;
      var stateLabel = link.status === 'warn' ? 'Warning' : link.status.charAt(0).toUpperCase() + link.status.slice(1);
      return '<div class="link-row status-' + esc(link.status) + '" title="' + esc(link.message || '') + '">' +
        '<span class="status-mark status-' + (link.status === 'ok' ? 'done' : link.status === 'warn' ? 'in-progress' : link.status === 'error' ? 'blocked' : 'rejected') + '" aria-hidden="true"></span>' +
        '<span class="link-body"><span class="link-pkg">' + esc(name) + '</span>' +
          '<span class="link-consumer">' + esc(link.consumer) + '</span></span>' +
        '<span class="link-state">' + esc(stateLabel) + '</span>' +
        (link.status !== 'ok' && link.message ? '<span class="link-note">' + esc(link.message) + '</span>' : '') +
      '</div>';
    }).join('');
  }

  function renderAll() {
    renderSummary();
    renderTable();
    renderRepos();
    renderLinks();
  }

  function clearFilters() {
    state = { status: 'all', area: 'all', repo: 'all', priority: 'all', search: '' };
    document.getElementById('search').value = '';
    document.getElementById('status-filter').value = 'all';
    document.getElementById('area-filter').value = 'all';
    document.getElementById('repo-filter').value = 'all';
    document.getElementById('priority-filter').value = 'all';
    renderAll();
  }

  function toast(message) {
    var element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove('visible'); }, 1800);
  }

  function copyText(value, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        function () { toast(message || 'Copied'); },
        function () { fallbackCopy(value, message); },
      );
      return;
    }
    fallbackCopy(value, message);
  }

  function fallbackCopy(value, message) {
    var area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      toast(message || 'Copied');
    } catch (error) {
      toast('Could not copy');
    }
    area.remove();
  }

  function buildToc(container, nav) {
    var headings = Array.prototype.slice.call(container.querySelectorAll('h1, h2, h3'));
    if (headings.length === 0) {
      nav.hidden = true;
      nav.setAttribute('data-empty', 'true');
      return;
    }

    nav.removeAttribute('data-empty');
    nav.hidden = false;
    nav.innerHTML = '<p class="toc-title">On this page</p><ol>' +
      headings.map(function (heading, index) {
        var id = 'spec-section-' + index;
        heading.id = id;
        var level = Number(heading.tagName.slice(1));
        return '<li class="toc-level-' + level + '"><a href="#" data-toc="' + id + '">' +
          esc(heading.textContent) + '</a></li>';
      }).join('') + '</ol>';

    nav.querySelectorAll('a[data-toc]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        var target = document.getElementById(link.getAttribute('data-toc'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function openFeature(docId, options) {
    var feature = DATA.features.find(function (item) { return item.docId === docId; });
    if (!feature) return;

    var dialog = document.getElementById('detail');
    var warnings = feature.warnings.length
      ? '<div class="sheet-warnings"><strong>' + feature.warnings.length + ' validation warning' +
        (feature.warnings.length === 1 ? '' : 's') + '</strong><ul>' +
        feature.warnings.map(function (warning) { return '<li>' + esc(warning.message) + '</li>'; }).join('') +
        '</ul></div>'
      : '';

    var facts = '';
    if (feature.owners.length || feature.related.length) {
      facts = '<dl class="sheet-facts">' +
        (feature.owners.length
          ? '<div><dt>Owners</dt><dd>' + feature.owners.map(esc).join(', ') + '</dd></div>'
          : '') +
        (feature.related.length
          ? '<div><dt>Related</dt><dd>' + feature.related.map(function (item) {
            return '<code>' + esc(item) + '</code>';
          }).join(' ') + '</dd></div>'
          : '') +
        '</dl>';
    }

    var editorHref = 'vscode://file/' + encodeURI(feature.path.replace(/\\/g, '/'));

    dialog.innerHTML =
      '<div class="sheet-top">' +
        '<div class="sheet-head">' +
          '<div class="sheet-heading">' +
            '<p class="sheet-kicker">' + statusMark(feature.status) +
              '<span>' + esc(statusLabel(feature.status)) + '</span>' +
              '<span class="sheet-sep" aria-hidden="true"></span>' +
              '<span class="mono">' + esc(feature.docId) + '</span></p>' +
            '<h2 class="sheet-title">' + esc(feature.title) + '</h2>' +
            '<p class="sheet-path" title="' + esc(feature.path) + '">' + esc(feature.relativePath) + '</p>' +
          '</div>' +
          '<button class="close" type="button" aria-label="Close spec">Close</button>' +
        '</div>' +
        '<div class="sheet-toolbar">' +
          '<div class="tabs" role="tablist" aria-label="Spec view">' +
            '<button class="tab is-active" type="button" role="tab" aria-selected="true" data-view="rendered">Rendered</button>' +
            '<button class="tab" type="button" role="tab" aria-selected="false" data-view="raw">Markdown</button>' +
          '</div>' +
          '<div class="sheet-actions">' +
            '<button class="btn btn-quiet" type="button" data-copy-spec>Copy Markdown</button>' +
            '<button class="btn btn-quiet" type="button" data-copy-path>Copy path</button>' +
            '<a class="btn" href="' + esc(editorHref) + '">Open in editor</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sheet-body">' +
        '<div class="sheet-meta">' +
          '<span>Area <strong>' + esc(feature.area) + '</strong></span>' +
          '<span>Priority <strong class="priority-' + esc(feature.priority) + '">' + esc(feature.priority) + '</strong></span>' +
          '<span>Target <strong>' + esc(feature.target) + '</strong></span>' +
          '<span>Updated <strong>' + formatDate(feature.updated) + '</strong></span>' +
        '</div>' +
        warnings +
        facts +
        '<div class="sheet-layout">' +
          '<nav class="toc" id="detail-toc" aria-label="Spec sections"></nav>' +
          '<div class="sheet-content">' +
            '<article class="markdown" id="detail-rendered">' + feature.bodyHtml + '</article>' +
            '<pre class="raw" id="detail-raw" hidden><code>' + esc(feature.body) + '</code></pre>' +
          '</div>' +
        '</div>' +
      '</div>';

    var toc = dialog.querySelector('#detail-toc');
    var rendered = dialog.querySelector('#detail-rendered');
    var firstHeading = rendered.querySelector('h1');
    if (firstHeading && firstHeading.textContent.trim() === feature.title.trim()) {
      firstHeading.remove();
    }
    buildToc(rendered, toc);

    dialog.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var view = tab.getAttribute('data-view');
        dialog.querySelectorAll('.tab').forEach(function (item) {
          var active = item === tab;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        rendered.hidden = view !== 'rendered';
        dialog.querySelector('#detail-raw').hidden = view !== 'raw';
        toc.hidden = view !== 'rendered' || toc.getAttribute('data-empty') === 'true';
      });
    });

    dialog.querySelector('[data-copy-spec]').addEventListener('click', function () {
      copyText(feature.body, 'Copied Markdown');
    });
    dialog.querySelector('[data-copy-path]').addEventListener('click', function () {
      copyText(feature.path, 'Copied path');
    });
    dialog.querySelector('.close').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () {
      if (location.hash.indexOf('#/feature/') === 0) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    }, { once: true });

    if (!options || options.updateHash !== false) {
      history.replaceState(null, '', '#/feature/' + encodeURIComponent(feature.docId));
    }

    dialog.showModal();
  }

  function openFromHash() {
    var match = location.hash.match(/^#\/feature\/(.+)$/);
    if (!match) return;
    var docId;
    try {
      docId = decodeURIComponent(match[1]);
    } catch (error) {
      return;
    }
    openFeature(docId, { updateHash: false });
  }

  buildShell();
  renderAll();
  openFromHash();
  window.addEventListener('hashchange', function () {
    var dialog = document.getElementById('detail');
    if (!dialog.open) openFromHash();
  });
})();
