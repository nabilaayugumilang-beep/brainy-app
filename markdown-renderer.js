(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MarkdownRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseInline(value) {
    const text = String(value || '');
    const tokens = [];
    const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > cursor) tokens.push({ type: 'text', value: text.slice(cursor, match.index) });
      if (match[2] !== undefined || match[3] !== undefined) {
        tokens.push({ type: 'strong', value: match[2] !== undefined ? match[2] : match[3] });
      } else if (match[4] !== undefined || match[5] !== undefined) {
        tokens.push({ type: 'emphasis', value: match[4] !== undefined ? match[4] : match[5] });
      } else if (match[6] !== undefined) {
        tokens.push({ type: 'code', value: match[6] });
      } else {
        tokens.push({ type: 'link', value: match[7], href: safeUrl(match[8]) });
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) });
    if (!tokens.length) tokens.push({ type: 'text', value: text });
    return tokens;
  }

  function safeUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : '';
  }

  function tableCells(line) {
    let value = String(line || '').trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
  }

  function isTableDivider(line) {
    const cells = tableCells(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function parse(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }

      const fence = line.match(/^\s*```([^\s`]*)\s*$/);
      if (fence) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
        if (index < lines.length) index += 1;
        blocks.push({ type: 'codeBlock', language: fence[1] || '', value: code.join('\n') });
        continue;
      }

      if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
        const headers = tableCells(line).map(parseInline);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          rows.push(tableCells(lines[index]).map(parseInline));
          index += 1;
        }
        blocks.push({ type: 'table', headers, rows });
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) });
        index += 1;
        continue;
      }

      const list = line.match(/^\s*([-*+] |\d+\. )(.+)$/);
      if (list) {
        const ordered = /^\d/.test(list[1]);
        const items = [];
        while (index < lines.length) {
          const item = lines[index].match(/^\s*([-*+] |\d+\. )(.+)$/);
          if (!item || /^\d/.test(item[1]) !== ordered) break;
          items.push(parseInline(item[2]));
          index += 1;
        }
        blocks.push({ type: 'list', ordered, items });
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
        blocks.push({ type: 'quote', inline: parseInline(quote.join('\n')) });
        continue;
      }

      const paragraph = [line];
      index += 1;
      while (index < lines.length && lines[index].trim()) {
        if (/^\s*```/.test(lines[index]) || /^(#{1,6})\s+/.test(lines[index]) || /^\s*([-*+] |\d+\. )/.test(lines[index])) break;
        if (lines[index].includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) break;
        paragraph.push(lines[index++]);
      }
      blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join('\n')) });
    }
    return blocks;
  }

  function appendInline(element, tokens, documentRef) {
    tokens.forEach((token) => {
      if (token.type === 'text') {
        const parts = token.value.split('\n');
        parts.forEach((part, index) => {
          if (index) element.append(documentRef.createElement('br'));
          element.append(documentRef.createTextNode(part));
        });
        return;
      }
      const tag = token.type === 'strong' ? 'strong' : token.type === 'emphasis' ? 'em' : token.type === 'code' ? 'code' : 'a';
      const child = documentRef.createElement(tag);
      child.textContent = token.value;
      if (tag === 'a') {
        if (!token.href) { element.append(documentRef.createTextNode(token.value)); return; }
        child.href = token.href;
        child.target = '_blank';
        child.rel = 'noopener noreferrer';
      }
      element.append(child);
    });
  }

  function tableClass(columnCount) {
    return Number(columnCount) === 2
      ? 'markdown-table markdown-table--two-column'
      : 'markdown-table markdown-table--multi-column';
  }

  function render(container, markdown) {
    if (!container || !container.ownerDocument) return;
    const documentRef = container.ownerDocument;
    const fragment = documentRef.createDocumentFragment();
    parse(markdown).forEach((block) => {
      if (block.type === 'codeBlock') {
        const pre = documentRef.createElement('pre');
        const code = documentRef.createElement('code');
        code.textContent = block.value;
        if (block.language) code.dataset.language = block.language;
        pre.append(code); fragment.append(pre); return;
      }
      if (block.type === 'table') {
        const wrap = documentRef.createElement('div'); wrap.className = 'markdown-table-wrap';
        const table = documentRef.createElement('table'); table.className = tableClass(block.headers.length);
        const thead = documentRef.createElement('thead'); const headRow = documentRef.createElement('tr');
        block.headers.forEach((tokens) => { const th = documentRef.createElement('th'); appendInline(th, tokens, documentRef); headRow.append(th); });
        thead.append(headRow); table.append(thead);
        const tbody = documentRef.createElement('tbody');
        block.rows.forEach((row) => { const tr = documentRef.createElement('tr'); row.forEach((tokens) => { const td = documentRef.createElement('td'); appendInline(td, tokens, documentRef); tr.append(td); }); tbody.append(tr); });
        table.append(tbody); wrap.append(table); fragment.append(wrap); return;
      }
      if (block.type === 'list') {
        const list = documentRef.createElement(block.ordered ? 'ol' : 'ul');
        block.items.forEach((tokens) => { const item = documentRef.createElement('li'); appendInline(item, tokens, documentRef); list.append(item); });
        fragment.append(list); return;
      }
      const tag = block.type === 'heading' ? `h${block.level}` : block.type === 'quote' ? 'blockquote' : 'p';
      const element = documentRef.createElement(tag);
      appendInline(element, block.inline, documentRef);
      fragment.append(element);
    });
    container.replaceChildren(fragment);
  }

  return { parse, parseInline, render, safeUrl, tableClass };
});
