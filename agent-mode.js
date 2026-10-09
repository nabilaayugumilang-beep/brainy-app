(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AgentMode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'brainy_interaction_mode';
  const OPEN = '[[BRAINY_AGENT_MODE]]';
  const CLOSE = '[[/BRAINY_AGENT_MODE]]';
  const POLICY = [
    OPEN,
    'Operate as an execution agent for this request.',
    '- Use the available tools when they materially help; do not stop at instructions when you can complete the work.',
    '- Keep progress concise and verify the result before claiming success.',
    '- Use native approval gates before risky, irreversible, external-send, account, or destructive actions.',
    '- Ask a question only when missing information genuinely blocks safe execution.',
    CLOSE,
    ''
  ].join('\n');

  function normalizeMode(value) {
    return value === 'agent' ? 'agent' : 'chat';
  }

  function load(storage) {
    try { return normalizeMode(storage && storage.getItem(STORAGE_KEY)); }
    catch { return 'chat'; }
  }

  function save(storage, mode) {
    const next = normalizeMode(mode);
    try { if (storage) storage.setItem(STORAGE_KEY, next); } catch { /* non-fatal */ }
    return next;
  }

  function preparePrompt(mode, text) {
    const request = String(text || '');
    return normalizeMode(mode) === 'agent' ? `${POLICY}\n${request}` : request;
  }

  function stripPrompt(text) {
    return String(text || '');
  }

  function activityLabel(toolName) {
    const name = String(toolName || '').toLowerCase();
    if (name.includes('computer_use')) return 'Using the computer';
    if (name.includes('browser')) return 'Working in the browser';
    if (name.includes('web_')) return 'Researching the web';
    if (name.includes('google') || name.includes('gmail') || name.includes('calendar') || name.includes('drive')) return 'Working in Google Workspace';
    if (name.includes('terminal') || name.includes('process') || name.includes('execute_code')) return 'Running a task';
    if (name.includes('file') || name.includes('patch')) return 'Working with files';
    if (name.includes('delegate')) return 'Coordinating a specialist';
    return 'Using a tool';
  }

  return { STORAGE_KEY, normalizeMode, load, save, preparePrompt, stripPrompt, activityLabel };
});
