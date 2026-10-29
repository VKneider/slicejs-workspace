import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../lib/markdown.mjs';

test('escapes raw HTML from feature specs', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.equal(html, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.ok(!html.includes('<script>'));
});

test('renders headings, lists, code and tables', () => {
  const html = renderMarkdown(`# Title

- one
- two

\`\`\`js
const value = 1 < 2;
\`\`\`

| Column | Value |
| --- | --- |
| a | b |`);

  assert.ok(html.includes('<h1>Title</h1>'));
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  assert.ok(html.includes('<pre><code class="language-js">const value = 1 &lt; 2;</code></pre>'));
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<th>Column</th>'));
  assert.ok(html.includes('<td>a</td>'));
});

test('renders inline code before bold and keeps HTML escaped', () => {
  const html = renderMarkdown('Use `**not bold**` and **bold**.');
  assert.ok(html.includes('<code>**not bold**</code>'));
  assert.ok(html.includes('<strong>bold</strong>'));
});

test('only links safe URLs', () => {
  const safe = renderMarkdown('[docs](https://example.com/docs)');
  assert.ok(safe.includes('href="https://example.com/docs"'));

  const unsafe = renderMarkdown('[click](javascript:alert(1))');
  assert.ok(!unsafe.includes('<a '));
  assert.ok(unsafe.includes('click'));
});

test('renders task-list checkboxes', () => {
  const html = renderMarkdown('- [ ] pending\n- [x] done');
  assert.ok(html.includes('<input type="checkbox" disabled>'));
  assert.ok(html.includes('<input type="checkbox" disabled checked>'));
});

test('renders nested lists and joins continuation lines', () => {
  const html = renderMarkdown(
    '- Parent\n  - Child line one\n    continued here\n  - Child two\n- Sibling',
  );
  assert.equal(
    html,
    '<ul><li>Parent<ul><li>Child line one continued here</li><li>Child two</li></ul></li>' +
      '<li>Sibling</li></ul>',
  );
});
