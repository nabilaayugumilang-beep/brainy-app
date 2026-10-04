const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { closeThen } = require('./session-actions.js');
const ProjectStore = require('./project-store.js');
const CommandPalette = require('./command-palette.js');
const MarkdownRenderer = require('./markdown-renderer.js');

const html = fs.readFileSync('index.html', 'utf8');

test('closeThen blocks the next operation when closing fails', async () => {
  const calls = [];
  const rpc = async (method) => {
    calls.push(method);
    if (method === 'session.close') throw new Error('close failed');
  };
  let invalidated = false;
  let nextRan = false;
  await assert.rejects(
    closeThen(rpc, 'live-1', () => { invalidated = true; }, async () => { nextRan = true; }),
    /close failed/
  );
  assert.deepEqual(calls, ['session.close']);
  assert.equal(invalidated, false);
  assert.equal(nextRan, false);
});

test('closeThen closes and invalidates before running the next operation', async () => {
  const order = [];
  const rpc = async (method) => { order.push(method); };
  const result = await closeThen(
    rpc,
    'live-1',
    () => { order.push('invalidated'); },
    async () => { order.push('next'); return 'done'; }
  );
  assert.deepEqual(order, ['session.close', 'invalidated', 'next']);
  assert.equal(result, 'done');
});

test('project store creates uniquely named projects and selects the new project', () => {
  let state = ProjectStore.empty();
  state = ProjectStore.create(state, ' Work ', 'p_one', 100);
  state = ProjectStore.create(state, 'work', 'p_two', 200);
  assert.deepEqual(state.projects.map(project => project.name), ['Work', 'work (2)']);
  assert.equal(state.selected, 'p_two');
});

test('project store assigns and unassigns stored chat ids', () => {
  let state = ProjectStore.create(ProjectStore.empty(), 'Work', 'p_work', 100);
  state = ProjectStore.assign(state, 'stored-chat-1', 'p_work');
  assert.equal(ProjectStore.projectForSession(state, 'stored-chat-1'), 'p_work');
  state = ProjectStore.assign(state, 'stored-chat-1', null);
  assert.equal(ProjectStore.projectForSession(state, 'stored-chat-1'), null);
});

test('deleting a project preserves chats by moving them to ungrouped', () => {
  let state = ProjectStore.create(ProjectStore.empty(), 'Work', 'p_work', 100);
  state = ProjectStore.assign(state, 'stored-chat-1', 'p_work');
  state = ProjectStore.remove(state, 'p_work');
  assert.equal(state.projects.length, 0);
  assert.equal(ProjectStore.projectForSession(state, 'stored-chat-1'), null);
  assert.equal(state.selected, 'all');
});

test('project store renames safely and rejects blank names', () => {
  let state = ProjectStore.create(ProjectStore.empty(), 'Work', 'p_work', 100);
  state = ProjectStore.rename(state, 'p_work', ' Personal ');
  assert.equal(state.projects[0].name, 'Personal');
  assert.throws(() => ProjectStore.rename(state, 'p_work', '   '), /Project name/);
});

test('project store saves a clean description and instructions for each project', () => {
  let state = ProjectStore.create(ProjectStore.empty(), 'Work', 'p_work', 100);
  state = ProjectStore.updateDetails(state, 'p_work', {
    description: '  Weekly   planning hub  ',
    instructions: 'Use concise English.\nSeparate facts from assumptions.'
  });
  assert.equal(state.projects[0].description, 'Weekly planning hub');
  assert.equal(state.projects[0].instructions, 'Use concise English.\nSeparate facts from assumptions.');
  assert.throws(() => ProjectStore.updateDetails(state, 'missing', {}), /Project not found/);
});

test('project store recovers from corrupt local storage', () => {
  const storage = { getItem: () => '{broken', setItem: () => {} };
  assert.deepEqual(ProjectStore.load(storage), ProjectStore.empty());
});

test('chat rename metadata overrides the backend title and can be cleared', () => {
  let state = ProjectStore.renameSession(ProjectStore.empty(), 'chat-1', '  Hiring   plan  ');
  assert.equal(ProjectStore.sessionTitle(state, 'chat-1', 'Backend title'), 'Hiring plan');
  state = ProjectStore.renameSession(state, 'chat-1', '');
  assert.equal(ProjectStore.sessionTitle(state, 'chat-1', 'Backend title'), 'Backend title');
});

test('pinned chats sort first without disturbing the order inside each group', () => {
  let state = ProjectStore.setPinned(ProjectStore.empty(), 'chat-2', true);
  state = ProjectStore.setPinned(state, 'chat-3', true);
  const items = [{id:'chat-1'},{id:'chat-2'},{id:'chat-3'},{id:'chat-4'}];
  assert.equal(ProjectStore.isPinned(state, 'chat-2'), true);
  assert.deepEqual(ProjectStore.sortSessions(state, items).map(item => item.id), ['chat-2','chat-3','chat-1','chat-4']);
  state = ProjectStore.setPinned(state, 'chat-2', false);
  assert.equal(ProjectStore.isPinned(state, 'chat-2'), false);
});

test('chat search matches custom titles and previews case-insensitively', () => {
  let state = ProjectStore.renameSession(ProjectStore.empty(), 'chat-1', 'Hiring Plan');
  const items = [
    {id:'chat-1', title:'BRAINY Desk', preview:'Draft the role profile'},
    {id:'chat-2', title:'Budget', preview:'Quarterly forecast review'}
  ];
  assert.deepEqual(ProjectStore.filterSessions(state, items, 'hiring').map(item => item.id), ['chat-1']);
  assert.deepEqual(ProjectStore.filterSessions(state, items, 'FORECAST').map(item => item.id), ['chat-2']);
  assert.equal(ProjectStore.filterSessions(state, items, 'missing').length, 0);
});

test('project context wraps the first request and strips back to the exact user text', () => {
  let state = ProjectStore.create(ProjectStore.empty(), 'People & OD', 'p_od', 100);
  state = ProjectStore.updateDetails(state, 'p_od', {
    description:'Workforce planning',
    instructions:'Separate known, uncertain, and assumed information.'
  });
  state = ProjectStore.assign(state, 'chat-1', 'p_od');
  const wrapped = ProjectStore.applyProjectContext(state, 'chat-1', 'Compare these options.');
  assert.match(wrapped, /BRAINY_PROJECT_CONTEXT/);
  assert.match(wrapped, /People & OD/);
  assert.match(wrapped, /Separate known, uncertain/);
  assert.equal(ProjectStore.stripProjectContext(wrapped), 'Compare these options.');
  const markerLikePrompt = 'Keep this literal marker: [[/BRAINY_PROJECT_CONTEXT]]\n\nthen continue.';
  const wrappedMarkerPrompt = ProjectStore.applyProjectContext(state, 'chat-1', markerLikePrompt);
  assert.equal(ProjectStore.stripProjectContext(wrappedMarkerPrompt), markerLikePrompt);
  assert.equal(ProjectStore.applyProjectContext(state, 'chat-2', 'Plain request'), 'Plain request');
});

test('first-message preparation uses the latest project details at send time', () => {
  let state = ProjectStore.create(ProjectStore.empty(), 'People & OD', 'p_od', 100);
  state = ProjectStore.assign(state, 'chat-1', 'p_od');
  assert.equal(ProjectStore.prepareFirstPrompt(state, 'chat-1', 'Hello', true), 'Hello');
  state = ProjectStore.updateDetails(state, 'p_od', { instructions:'Use the seeded facts.' });
  const prepared = ProjectStore.prepareFirstPrompt(state, 'chat-1', 'Hello', true);
  assert.match(prepared, /Use the seeded facts\./);
  assert.equal(ProjectStore.stripProjectContext(prepared), 'Hello');
  assert.equal(ProjectStore.prepareFirstPrompt(state, 'chat-1', 'Follow-up', false), 'Follow-up');
});

test('offline first message is contextualized only when the queued prompt is sent', () => {
  assert.match(html, /projectContextPending = !visibleMessages\.length/);
  const preparations = html.match(/const submittedPrompt = ProjectStore\.prepareFirstPrompt\(projectState, sessionKey, promptText, projectContextPending\)/g) || [];
  assert.equal(preparations.length, 2);
  assert.match(html, /queuedText=promptText/);
  assert.doesNotMatch(html, /queuedText=submittedPrompt/);
});

test('assistant markdown parser recognizes rich text without treating raw HTML as markup', () => {
  const blocks = MarkdownRenderer.parse('A **bold** and *italic* answer with `code`.\n\n<script>alert(1)</script>');
  assert.equal(blocks[0].type, 'paragraph');
  assert.deepEqual(blocks[0].inline.map((token) => token.type), ['text', 'strong', 'text', 'emphasis', 'text', 'code', 'text']);
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[1].inline[0].value, '<script>alert(1)</script>');
});

test('assistant markdown parser recognizes pipe tables', () => {
  const blocks = MarkdownRenderer.parse('| Name | Status |\n| --- | --- |\n| BRAINY | Live |');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].headers.map((cell) => cell[0].value), ['Name', 'Status']);
  assert.deepEqual(blocks[0].rows[0].map((cell) => cell[0].value), ['BRAINY', 'Live']);
});

test('assistant messages render Markdown after completion and when history is restored', () => {
  assert.match(html, /<script src="\.\/markdown-renderer\.js"><\/script>/);
  assert.match(html, /if \(role === 'assistant' && !pendingState\) MarkdownRenderer\.render\(body, text\)/);
  assert.match(html, /MarkdownRenderer\.render\(currentAssistant, finalText\)/);
  assert.match(html, /MarkdownRenderer\.render\(currentAssistant, currentText\)/);
  assert.match(html, /updateViaCache:'none'/);
  assert.match(html, /registration\.update\(\)/);
  assert.match(html, /controllerchange/);
  assert.match(html, /\.markdown-table-wrap/);
  assert.match(html, /\.content table/);
});

test('wide Markdown tables scroll inside their own wrapper without shifting the chat', () => {
  assert.match(html, /main \{[^}]*overflow-y:auto;[^}]*overflow-x:hidden;/);
  assert.match(html, /\.message \{[^}]*min-width:0;[^}]*max-width:100%;/);
  assert.match(html, /\.content \{[^}]*min-width:0;[^}]*max-width:100%;/);
  assert.match(html, /\.markdown-table-wrap \{[^}]*width:100%;[^}]*overflow-x:auto;[^}]*overscroll-behavior-inline:contain;/);
});

test('slash command palette filters commands and exposes prompt or action behavior', () => {
  assert.deepEqual(CommandPalette.match('/res').map(command => command.name), ['research']);
  assert.equal(CommandPalette.match('normal text').length, 0);
  assert.equal(CommandPalette.get('draft').prompt, 'Draft this for me: ');
  assert.equal(CommandPalette.get('new').action, 'new');
  assert.equal(CommandPalette.get('project').action, 'project');
});

test('slash command palette is keyboard accessible from the composer', () => {
  assert.match(html, /src="\.\/command-palette\.js"/);
  assert.match(html, /id="commandPalette"/);
  assert.match(html, /CommandPalette\.match\(input\.value\)/);
  assert.match(html, /e\.key === 'ArrowDown'/);
  assert.match(html, /e\.key === 'ArrowUp'/);
  assert.match(html, /chooseSlashCommand\(slashMatches\[slashIndex\]\)/);
  assert.match(html, /if \(e\.isComposing\) return/);
});

test('composer keeps Enter as a newline and sends only from a deliberate shortcut', () => {
  assert.match(html, /if \(\(e\.metaKey \|\| e\.ctrlKey\) && e\.key === 'Enter'\)/);
  assert.match(html, /requestSubmit\(\)/);
  assert.doesNotMatch(html, /if \(e\.key==='Enter' && !e\.shiftKey\) \{ e\.preventDefault\(\); \$\('#composer'\)\.requestSubmit\(\); \}/);
});

test('bridge keeps all backend calls on the dynamic tunnel', () => {
  assert.match(html, /let backendUrl/);
  assert.match(html, /fetch\(`\$\{backendUrl\}\/api\/auth\/ws-ticket`/);
  assert.match(html, /fetch\(`\$\{backendUrl\}\/api\/brainy\/codex-usage`/);
  assert.match(html, /new WebSocket\(`\$\{proto\}\/\/\$\{wsBackend\.host\}/);
});

test('repository contains no access key or backend URL', () => {
  assert.doesNotMatch(html, /trycloudflare\.com/);
  assert.doesNotMatch(html, /access=[a-f0-9]{32,}/);
});

test('fonts are served by GitHub Pages using relative paths', () => {
  assert.match(html, /\.\/fonts-terminal\/JetBrainsMono-Regular\.woff2/);
  assert.match(html, /\.\/fonts-terminal\/JetBrainsMono-Bold\.woff2/);
});

test('app is installable and keeps its secure backend after launch', () => {
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /localStorage\.setItem\('brainy_backend'/);
  assert.match(html, /localStorage\.getItem\('brainy_backend'/);
  assert.match(html, /serviceWorker\.register\('\.\/sw\.js\?v=20'/);
});

test('mobile app fills the true phone viewport without desktop overflow', () => {
  assert.match(html, /\.app \{[^}]*width:100%;[^}]*min-width:0;[^}]*overflow:hidden;/s);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.app \{[^}]*width:100dvw;[^}]*height:100dvh;/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.message \{[^}]*grid-template-columns:1fr;/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.prompt-chip \{[^}]*width:100%;[^}]*min-height:48px;/);
  assert.match(html, /body \{ font:13px\/1\.55/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.content \{[^}]*font-size:12px;/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.speaker \{[^}]*font-size:11px;/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.empty h1 \{[^}]*font-size:clamp\(28px,10vw,38px\);/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*textarea \{[^}]*font-size:12px;/);
});

test('mobile composer can preview and securely attach a camera or gallery photo', () => {
  assert.match(html, /<input[^>]+id="imageInput"[^>]+type="file"[^>]+accept="image\/\*"[^>]*>/);
  assert.match(html, /id="attachBtn"/);
  assert.match(html, /id="attachmentPreview"/);
  assert.match(html, /rpc\('image\.attach_bytes',\{session_id:sid,content_base64:image\.base64,filename:image\.name\}\)/);
  assert.match(html, /const MAX_IMAGE_DIMENSION = 1600/);
  assert.match(html, /className = 'chat-image'/);
});

test('Telegram Mini App expands to the full chat viewport', () => {
  assert.match(html, /https:\/\/telegram\.org\/js\/telegram-web-app\.js/);
  assert.match(html, /telegram\.WebApp\.ready\(\)/);
  assert.match(html, /telegram\.WebApp\.expand\(\)/);
});

test('history search filters the selected project by title or preview', () => {
  assert.match(html, /id="historySearch"/);
  assert.match(html, /historySearch\.addEventListener\('input'/);
  assert.match(html, /ProjectStore\.filterSessions\(projectState, filteredHistoryItems\(historyItems\), historySearchQuery\)/);
  assert.match(html, /No chats match this search\./);
});

test('history sidebar lists and resumes only BRAINY web conversations', () => {
  assert.match(html, /id="historyPanel"/);
  assert.match(html, /id="historyList"/);
  assert.match(html, /id="historyBtn"/);
  assert.match(html, /rpc\('session\.list',\{limit:200\}\)/);
  assert.match(html, /filter\(item => item\.source === 'brainy-web'/);
  assert.match(html, /rpc\('session\.resume',\{session_id:item\.id,cols:100,source:'brainy-web'\}\)/);
  assert.match(html, /localStorage\.setItem\('brainy_session',\s*sessionKey\)/);
  assert.match(html, /historyList\.replaceChildren\(\)/);
  assert.match(html, /historyTitle\.textContent/);
  assert.match(html, /historyAction\.textContent = item\.id === sessionKey \? 'Open now' : 'Open →'/);
  assert.match(html, /showToast\('This conversation is already open'\)/);
  assert.match(html, /button\.setAttribute\('aria-busy','true'\)/);
});

test('history offers local rename and pin controls without mutating backend sessions', () => {
  assert.match(html, /id="chatModal"/);
  assert.match(html, /id="chatNameInput"/);
  assert.match(html, /ProjectStore\.sessionTitle\(projectState, item\.id, historyName\(item\)\)/);
  assert.match(html, /ProjectStore\.setPinned\(projectState, item\.id, !pinned\)/);
  assert.match(html, /ProjectStore\.renameSession\(projectState, editingChatId, chatNameInput\.value\)/);
  assert.doesNotMatch(html, /rpc\('session\.rename'/);
});

test('history offers confirmed permanent deletion for inactive and active conversations', () => {
  assert.match(html, /className = 'history-delete history-control'/);
  assert.match(html, /delBtn\.textContent = 'Delete'/);
  assert.match(html, /aria-label.*Delete/);
  assert.match(html, /confirm\(`Permanently delete/);
  assert.match(html, /rpc\('session\.delete',\{session_id:item\.id\}\)/);
  assert.match(html, /localStorage\.removeItem\('brainy_session'\)/);
  assert.match(html, /showToast\('History deleted'\)/);
  assert.match(html, /isActive && busy/);
  assert.match(html, /BrainySessionActions\.closeThen/);
  assert.match(html, /function invalidateLiveSession\(\)/);
  assert.match(html, /if \(ev\.session_id && ev\.session_id !== sid\) return;/);
});

test('projects expose details, active context, and first-message instructions', () => {
  assert.match(html, /id="projectDescriptionInput"/);
  assert.match(html, /id="projectInstructionsInput"/);
  assert.match(html, /id="activeProjectChip"/);
  assert.match(html, /ProjectStore\.updateDetails\(/);
  assert.match(html, /function renderActiveProjectChip\(\)/);
  assert.match(html, /ProjectStore\.prepareFirstPrompt\(projectState, sessionKey, promptText, projectContextPending\)/);
  assert.match(html, /ProjectStore\.stripProjectContext\(message\.text\)/);
});

test('projects categorize chats without changing or deleting backend sessions', () => {
  assert.match(html, /id="projectsSection"/);
  assert.match(html, /id="addProjectBtn"/);
  assert.match(html, /id="projectList"/);
  assert.match(html, /ProjectStore\.assign\(projectState, item\.id/);
  assert.match(html, /ProjectStore\.remove\(projectState, projectId\)/);
  assert.match(html, /without deleting chats/);
  assert.match(html, /createdNewSession/);
  assert.match(html, /ProjectStore\.assign\(projectState, sessionKey, projectState\.selected\)/);
  assert.doesNotMatch(html, /innerHTML\s*=.*project/i);
});

test('No project is rendered as a nested All chats subfilter', () => {
  assert.match(html, /className = 'project-overview'/);
  assert.match(html, /className = 'project-subgroup'/);
  assert.match(html, /overview\.append\(projectFilterRow\('all','All chats'/);
  assert.match(html, /subgroup\.append\(projectFilterRow\('none','No project'/);
  assert.match(html, /project-list[\s\S]*\.project-subgroup/);
});

test('history preview keeps the full card width and wraps without clipping', () => {
  assert.match(html, /\.history-row \{[^}]*display:grid;[^}]*grid-template-columns:minmax\(0,1fr\);/);
  assert.match(html, /\.history-controls \{[^}]*grid-template-columns:minmax\(0,1fr\) auto auto auto;/);
  assert.match(html, /\.history-project-select \{[^}]*width:100%;/);
  assert.match(html, /\.history-preview \{[^}]*display:block;[^}]*white-space:normal;[^}]*overflow-wrap:anywhere;/);
  assert.doesNotMatch(html, /\.history-preview \{[^}]*line-clamp/);
});

test('interface is English-first with system, light, and dark themes', () => {
  assert.match(html, /<html lang="en" data-theme="auto">/);
  assert.match(html, /const themeOrder = \['auto','light','dark'\]/);
  assert.match(html, /Theme: System/);
  assert.match(html, />New<\/button>/);
  assert.match(html, />Send<\/button>/);
  assert.doesNotMatch(html, /(?:>Buka|>Siap|>Kirim|>Hapus|>Baru<\/)/);
});

test('visual system uses Hermes-inspired electric blue in light and dark modes', () => {
  assert.match(html, /--electric:#1717ff/);
  assert.match(html, /--electric-soft:/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.match(html, /radial-gradient\(/);
  assert.match(html, /box-shadow:.*var\(--glow\)/);
});

test('the approved Hermes interface uses the previous JetBrains Mono font throughout', () => {
  assert.match(html, /body \{[^}]*font:13px\/1\.55 'JetBrains Mono',/);
  assert.doesNotMatch(html, /body \{[^}]*\bInter,/);
});

test('history sidebar becomes a closable drawer on narrow screens', () => {
  assert.match(html, /@media \(max-width:900px\)[\s\S]*\.history-panel \{[^}]*position:fixed;[^}]*transform:translateX\(-105%\);/);
  assert.match(html, /\.history-panel\.open \{ transform:translateX\(0\); \}/);
  assert.match(html, /id="historyBackdrop"/);
  assert.match(html, /function toggleHistory\(open\)/);
});

test('history can be hidden and reopened on desktop with its state remembered', () => {
  assert.match(html, /\.workspace-shell\.history-open \{[^}]*grid-template-columns:260px minmax\(0,920px\);/);
  assert.match(html, /\.workspace-shell:not\(\.history-open\) \.history-panel \{[^}]*display:none;/);
  assert.match(html, /\.history-close, \.history-toggle \{[^}]*display:inline-grid;/);
  assert.match(html, /const HISTORY_OPEN_KEY = 'brainy_history_open'/);
  assert.match(html, /localStorage\.getItem\(HISTORY_OPEN_KEY\) === 'true'/);
  assert.match(html, /localStorage\.setItem\(HISTORY_OPEN_KEY, String\(shouldOpen\)\)/);
  assert.match(html, /workspaceShell\.classList\.toggle\('history-open', shouldOpen\)/);
  assert.match(html, /historyPanel\.setAttribute\('aria-hidden', String\(!shouldOpen\)\)/);
});

test('standalone app can recover access with a one-time activation code', () => {
  assert.match(html, /id="activationPanel"/);
  assert.match(html, /id="activationCode"/);
  assert.match(html, /\/api\/auth\/activate/);
  assert.match(html, /localStorage\.setItem\('brainy_access',\s*accessKey\)/);
});

test('scrollbars follow the active light, dark, or automatic theme', () => {
  assert.match(html, /:root \{[\s\S]*--scroll-track:#f5f7ff;[^}]*--scroll-thumb:#bdc9ea;[^}]*--scroll-thumb-hover:#8da0d3;/);
  assert.match(html, /:root\[data-theme="dark"\] \{[\s\S]*--scroll-track:#080b19;[^}]*--scroll-thumb:#2a3767;[^}]*--scroll-thumb-hover:#43558f;/);
  assert.match(html, /:root:not\(\[data-theme="light"\]\) \{[\s\S]*--scroll-track:#080b19;[^}]*--scroll-thumb:#2a3767;[^}]*--scroll-thumb-hover:#43558f;/);
  assert.match(html, /scrollbar-color:var\(--scroll-thumb\) var\(--scroll-track\)/);
  assert.match(html, /\*::-webkit-scrollbar \{[^}]*background:var\(--scroll-track\);/);
  assert.match(html, /\*::-webkit-scrollbar-track \{ background:var\(--scroll-track\); \}/);
  assert.match(html, /\*::-webkit-scrollbar-track-piece \{ background:var\(--scroll-track\); \}/);
  assert.match(html, /\*::-webkit-scrollbar-thumb \{[^}]*background:var\(--scroll-thumb\);/);
  assert.match(html, /\*::-webkit-scrollbar-corner \{ background:var\(--scroll-track\); \}/);
  assert.match(html, /\*::-webkit-scrollbar-button \{[^}]*display:none;/);
});

test('app discovers the latest rotating backend without storing its access key', () => {
  const config = JSON.parse(fs.readFileSync('backend.json', 'utf8'));
  assert.match(config.backend, /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);
  assert.equal(Object.hasOwn(config, 'access'), false);
  assert.match(html, /fetch\('\.\/backend\.json',\s*\{cache:'no-store'\}\)/);
  assert.match(html, /async function refreshBackend/);
});

test('manifest and service worker provide a standalone offline app shell', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.match(html, /start_url:location\.href/);
  assert.match(html, /data:application\/manifest\+json/);
  assert.equal(manifest.name, 'BRAINY Desk');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.match(sw, /brainy-shell-v20/);
  assert.match(sw, /session-actions\.js/);
  assert.match(sw, /project-store\.js/);
  assert.match(sw, /command-palette\.js/);
  assert.match(sw, /markdown-renderer\.js/);
  assert.match(sw, /index\.html/);
  assert.match(sw, /manifest\.webmanifest/);
});
