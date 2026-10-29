export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:|#|\/|\.{1,2}\/)/i.test(url)) return url;
  return null;
}

function renderInline(text) {
  const codes = [];

  let output = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeUrl(url.replace(/&amp;/g, '&'));
    if (!href) return label;
    const attribute = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `<a href="${attribute}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  output = output.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);

  return output;
}

function renderTable(lines, start) {
  const splitRow = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const header = splitRow(lines[start]);
  const rows = [];
  let index = start + 2;

  while (index < lines.length && lines[index].includes('|') && !/^\s*$/.test(lines[index])) {
    rows.push(splitRow(lines[index]));
    index += 1;
  }

  const head = header.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
    .join('');

  return {
    html: `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    next: index,
  };
}

function renderListItem(item) {
  const task = item.match(/^\[( |x|X)\]\s+(.*)$/);
  if (task) {
    const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
    return `<input type="checkbox" disabled${checked}> ${renderInline(task[2])}`;
  }
  return renderInline(item);
}

function indentOf(line) {
  return line.match(/^\s*/)[0].replace(/\t/g, '  ').length;
}

function listTree(items) {
  const root = [];
  const stack = [{ indent: -1, children: root }];

  for (const item of items) {
    while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const node = { text: item.text, ordered: item.ordered, children: [] };
    parent.children.push(node);
    stack.push({ indent: item.indent, children: node.children });
  }

  return root;
}

function parseList(lines, start) {
  const baseIndent = indentOf(lines[start]);
  const items = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*$/.test(line)) {
      let next = index + 1;
      while (next < lines.length && /^\s*$/.test(lines[next])) next += 1;
      if (
        next < lines.length &&
        /^\s*([-*+]|\d+\.)\s+/.test(lines[next]) &&
        indentOf(lines[next]) >= baseIndent
      ) {
        index = next;
        continue;
      }
      break;
    }

    const item = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!item) {
      if (items.length > 0 && indentOf(line) > baseIndent) {
        items[items.length - 1].text += ` ${line.trim()}`;
        index += 1;
        continue;
      }
      break;
    }

    const indent = indentOf(line);
    if (indent < baseIndent) break;

    items.push({
      indent,
      ordered: /^\d+\./.test(item[2]),
      text: item[3],
    });
    index += 1;
  }

  return { items: listTree(items), next: index };
}

function renderList(nodes) {
  if (nodes.length === 0) return '';
  const tag = nodes[0].ordered ? 'ol' : 'ul';
  const items = nodes
    .map((node) => `<li>${renderListItem(node.text)}${renderList(node.children)}</li>`)
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

/**
 * Small, escape-first Markdown renderer for feature specs. It supports the
 * subset used by the feature files and never emits raw HTML from the source.
 */
export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*$/.test(line)) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([\w-]*)\s*$/);
    if (fence) {
      const language = fence[1];
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const className = language ? ` class="language-${escapeHtml(language)}"` : '';
      html.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])
    ) {
      const table = renderTable(lines, index);
      html.push(table.html);
      index = table.next;
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const list = parseList(lines, index);
      html.push(renderList(list.items));
      index = list.next;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      !/^\s*$/.test(lines[index]) &&
      !/^\s*(#{1,6}\s|```|>|([-*+]|\d+\.)\s)/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (paragraph.length === 0) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return html.join('\n');
}
