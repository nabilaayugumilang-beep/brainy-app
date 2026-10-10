const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { closeThen } = require('./session-actions.js');
const ProjectStore = require('./project-store.js');
const CommandPalette = require('./command-palette.js');
const MarkdownRenderer = require('./markdown-renderer.js');
const AgentMode = require('./agent-mode.js');
const ExpertSkills = require('./expert-skills.js');
const ApprovalQueue = require('./approval-queue.js');
const AgentHQ = require('./agent-hq.js');
const HomeDashboard = require('./home-dashboard.js');


const html = fs.readFileSync('index.html', 'utf8');
const actionCenterSource = fs.readFileSync('action-center.js', 'utf8');


test('personal home creates a local greeting and readable date without a network call', () => {
  const morning = new Date(2026, 9, 9, 8, 30);
  const evening = new Date(2026, 9, 9, 19, 0);
  assert.equal(HomeDashboard.greeting(morning, 'Ila'), 'Good morning, Ila');
  assert.equal(HomeDashboard.greeting(evening, 'Ila'), 'Good evening, Ila');
  assert.match(HomeDashboard.dateLabel(morning), /Friday, October 9/);
  const source = fs.readFileSync('home-dashboard.js', 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bWebSocket\b|\brpc\s*\(/);
});

test('personal home summarizes recent chats and drafts from local state only', () => {
  const chats = [
    {key:'older', title:'Older work', preview:'Earlier', updatedAt:100},
    {key:'latest', title:'Latest work', preview:'Continue this', updatedAt:300},
    {key:'middle', title:'Middle work', preview:'In progress', updatedAt:200},
    {key:'fourth', title:'Fourth work', preview:'Not shown', updatedAt:50}
  ];
  const drafts = [
    {id:'d1', templateId:'plan-event', values:{objective:'Town hall'}, updatedAt:10},
    {id:'d2', templateId:'review-work', values:{draft:'Review memo'}, updatedAt:20}
  ];
  const snapshot = JSON.stringify({chats,drafts});
  assert.deepEqual(HomeDashboard.recentChats(chats).map(item => item.id), ['latest','middle','older']);
  assert.deepEqual(HomeDashboard.recentDrafts(drafts, [
    {id:'plan-event',title:'Plan Event'}, {id:'review-work',title:'Review Work'}
  ]), [
    {id:'d2',templateId:'review-work',title:'Review Work',preview:'Review memo',updatedAt:20},
    {id:'d1',templateId:'plan-event',title:'Plan Event',preview:'Town hall',updatedAt:10}
  ]);
  assert.equal(JSON.stringify({chats,drafts}), snapshot);
});

test('personal home is a first-class zero-token workspace with local recents and quick actions', () => {
  assert.match(html, /<script src="\.\/home-dashboard\.js"><\/script>/);
  assert.match(html, /id="homeMode"[^>]*>Home<\/button>/);
  assert.match(html, /id="homeDashboard"[^>]*hidden/);
  assert.match(html, /id="homeGreeting"/);
  assert.match(html, /id="homeDate"/);
  assert.match(html, /id="homeContinue"/);
  assert.match(html, /id="homeDrafts"/);
  assert.match(html, /data-home-action="chat"/);
  assert.match(html, /data-home-action="agent"/);
  assert.match(html, /data-home-action="actions"/);
  assert.match(html, /BrainyHomeDashboard\.recentChats\(historyItems\)/);
  assert.match(html, /BrainyActionCenter\.loadDrafts\(localStorage\)/);
  assert.match(html, /function showHomeDashboard\(\)/);
  assert.match(html, /\.mode-switch \{[^}]*grid-template-columns:repeat\(5,1fr\)/);
  assert.doesNotMatch(html, /local-tools|data-home-action="tools"|id="localTools"/);
  assert.match(html, /\['brainy_local_tools_v1','brainy_note_scratch_v1','brainy_local_reminder_v1'\]\.forEach\(key => localStorage\.removeItem\(key\)\)/);
});

test('action center exposes five role workflows and prepares a compact expert handoff', () => {
  const ActionCenter = require('./action-center.js');
  assert.deepEqual(ActionCenter.templates().map(item => item.id), [
    'create-content', 'plan-event', 'draft-communication', 'review-work', 'people-od-task'
  ]);
  const prepared = ActionCenter.prepare('create-content', {
    objective:'Launch the employer-brand campaign', audience:'LinkedIn candidates',
    keyMessage:'Meet the people behind our work', notes:''
  });
  assert.equal(prepared.expertSkill, 'corporate-comms');
  assert.match(prepared.prompt, /Create Content/);
  assert.match(prepared.prompt, /Objective: Launch the employer-brand campaign/);
  assert.match(prepared.prompt, /Audience: LinkedIn candidates/);
  assert.doesNotMatch(prepared.prompt, /Notes:/);
  assert.ok(prepared.prompt.length <= 700);
});

test('action drafts stay local, sanitize fields, update safely, and recover from corrupt storage', () => {
  const ActionCenter = require('./action-center.js');
  let raw = '';
  const storage = {
    getItem:key => key === ActionCenter.STORAGE_KEY ? raw : null,
    setItem:(key,value) => { assert.equal(key, ActionCenter.STORAGE_KEY); raw = value; }
  };
  const saved = ActionCenter.saveDraft(storage, {
    templateId:'plan-event', values:{objective:'  Team   connection  ', audience:'All employees', injected:'ignore'}
  }, 1000);
  assert.equal(saved.id, 'action-1000');
  assert.equal(saved.values.objective, 'Team   connection');
  assert.equal(saved.values.injected, undefined);
  assert.deepEqual(ActionCenter.loadDrafts(storage).map(item => item.id), ['action-1000']);
  const updated = ActionCenter.saveDraft(storage, {
    id:saved.id, templateId:'plan-event', values:{objective:'Updated objective', audience:'Leaders'}
  }, 2000);
  assert.equal(updated.createdAt, 1000);
  assert.equal(updated.updatedAt, 2000);
  assert.equal(ActionCenter.loadDrafts(storage)[0].values.objective, 'Updated objective');
  ActionCenter.removeDraft(storage, saved.id);
  assert.deepEqual(ActionCenter.loadDrafts(storage), []);
  raw = '{broken';
  assert.deepEqual(ActionCenter.loadDrafts(storage), []);
});

test('action center UI is a zero-token workspace with explicit Agent preparation', () => {
  assert.match(html, /<script src="\.\/action-center\.js"><\/script>/);
  assert.match(html, /id="actionsMode"[^>]*>Actions<\/button>/);
  assert.match(html, /id="actionCenter"[^>]*hidden/);
  assert.match(html, /BrainyActionCenter\.saveDraft\(localStorage/);
  assert.match(html, /BrainyActionCenter\.prepare\(/);
  assert.match(html, /input\.value\s*=\s*prepared\.prompt/);
  assert.match(html, /setInteractionMode\('agent'\)/);
  assert.doesNotMatch(actionCenterSource, /\bfetch\s*\(|\bWebSocket\b|\brpc\s*\(/);
  assert.doesNotMatch(html, /prepareActionForAgent[\s\S]{0,1000}composer\.requestSubmit/);
});

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
  const preparations = html.match(/ProjectStore\.prepareFirstPrompt\(projectState, sessionKey, promptText, projectContextPending\)/g) || [];
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

test('assistant typography keeps Markdown headings compact and consistent', () => {
  assert.match(html, /\.content h1, \.content h2, \.content h3, \.content h4, \.content h5, \.content h6 \{[^}]*font-family:inherit;[^}]*line-height:1\.45;/);
  assert.match(html, /\.content h1 \{ font-size:15px; \}/);
  assert.match(html, /\.content h2 \{ font-size:14px; \}/);
  assert.match(html, /\.content h3 \{ font-size:13px; \}/);
  assert.match(html, /\.content h4, \.content h5, \.content h6 \{ font-size:12px; \}/);
  assert.match(html, /\.content p, \.content li, \.content blockquote \{ font-size:inherit; \}/);
});

test('two-column tables wrap into a phone-width reading layout', () => {
  assert.equal(MarkdownRenderer.tableClass(2), 'markdown-table markdown-table--two-column');
  assert.equal(MarkdownRenderer.tableClass(3), 'markdown-table markdown-table--multi-column');
  assert.match(html, /\.content table\.markdown-table--two-column \{[^}]*width:100%;[^}]*min-width:100%;[^}]*table-layout:fixed;/);
  assert.match(html, /\.markdown-table--two-column th:first-child, \.markdown-table--two-column td:first-child \{ width:30%; \}/);
  assert.match(html, /\.markdown-table--multi-column th, \.markdown-table--multi-column td \{[^}]*max-width:220px;[^}]*overflow-wrap:anywhere;/);
});

test('mobile Safari cannot auto-enlarge text inside wide Markdown tables', () => {
  assert.match(html, /html,body \{[^}]*-webkit-text-size-adjust:100%;[^}]*text-size-adjust:100%;/);
  assert.match(html, /\.content table \{[^}]*font-family:inherit;[^}]*font-size:12px;[^}]*-webkit-text-size-adjust:100%;[^}]*text-size-adjust:100%;/);
  assert.match(html, /\.content th, \.content td \{[^}]*font-family:inherit;[^}]*font-size:12px;[^}]*line-height:1\.5;/);
});

test('mobile text controls prevent iPhone auto-zoom while matching the compact UI type scale', () => {
  assert.match(html, /@media \(max-width:640px\) \{[\s\S]*?input, textarea, select \{ font-size:16px !important; font-size-adjust:\.448; \}/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
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

test('agent mode wraps execution guidance while stored transcript text remains verbatim', () => {
  const wrapped = AgentMode.preparePrompt('agent', 'Open the site and summarize it.');
  assert.match(wrapped, /BRAINY_AGENT_MODE/);
  assert.match(wrapped, /Use the available tools/);
  assert.equal(AgentMode.stripPrompt(wrapped), wrapped);
  assert.equal(AgentMode.preparePrompt('chat', 'Just answer this.'), 'Just answer this.');
  assert.equal(AgentMode.normalizeMode('unknown'), 'chat');
  assert.match(html, /return ProjectStore\.stripProjectContext\(text\)/);
  assert.doesNotMatch(html, /ProjectStore\.stripProjectContext\(AgentMode\.stripPrompt\(text\)\)/);
});

test('People & OD expert skill is opt-in, substantive-only, compact, and persisted safely', () => {
  assert.equal(ExpertSkills.normalize('unknown'), 'none');
  assert.equal(ExpertSkills.guidance('none', 'Analyze this workforce plan.'), '');
  assert.equal(ExpertSkills.guidance('people-od', 'Hi!'), '');
  assert.equal(ExpertSkills.isSubstantive('Hi!'), false);
  assert.equal(ExpertSkills.isSubstantive('Review this talent plan.'), true);
  const guidance = ExpertSkills.guidance('people-od', 'Review this talent plan.');
  assert.match(guidance, /People & OD/);
  assert.match(guidance, /evidence/i);
  assert.match(guidance, /assumptions/i);
  assert.match(guidance, /gaps/i);
  assert.match(guidance, /recommendations/i);
  assert.match(guidance, /FTE is capacity, not productivity/i);
  assert.match(guidance, /employment.*legal/i);
  assert.ok(guidance.length <= 520, `expert guidance is too large: ${guidance.length} chars`);

  const values = new Map();
  const storage = { getItem:key => values.get(key) || null, setItem:(key,value) => values.set(key,value) };
  assert.equal(ExpertSkills.load(storage), 'none');
  assert.equal(ExpertSkills.save(storage, 'people-od'), 'people-od');
  assert.equal(ExpertSkills.load(storage), 'people-od');
});

test('Corporate Communications expert is opt-in, substantive-only, compact, and claim-safe', () => {
  assert.equal(ExpertSkills.guidance('corporate-comms', 'Hi!'), '');
  const request = 'Design a social media engagement campaign for our next event.';
  const guidance = ExpertSkills.guidance('corporate-comms', request);
  assert.equal(ExpertSkills.normalize('corporate-comms'), 'corporate-comms');
  assert.match(guidance, /Corporate Communications/);
  assert.match(guidance, /audience/i);
  assert.match(guidance, /channel/i);
  assert.match(guidance, /brand/i);
  assert.match(guidance, /internal\/external comms.*PR\/media relations.*social\/editorial.*campaigns\/events.*executive comms.*creative governance.*stakeholder engagement.*reputation.*crisis\/issues/i);
  assert.match(guidance, /evidence\/assumptions\/gaps/i);
  assert.match(guidance, /success measures/i);
  assert.match(guidance, /Never invent company claims/i);
  assert.match(guidance, /privacy\/consent/i);
  assert.match(guidance, /measurement/i);
  assert.ok(guidance.length <= 520, `corporate communications guidance is too large: ${guidance.length} chars`);

  const values = new Map();
  const storage = { getItem:key => values.get(key) || null, setItem:(key,value) => values.set(key,value) };
  assert.equal(ExpertSkills.save(storage, 'corporate-comms'), 'corporate-comms');
  assert.equal(ExpertSkills.load(storage), 'corporate-comms');
});

test('expert notification label matches the selected expert pack', () => {
  assert.equal(ExpertSkills.label('people-od'), 'People & OD Expert');
  assert.equal(ExpertSkills.label('corporate-comms'), 'Corporate Communications Expert');
  assert.equal(ExpertSkills.label('none'), '');
  assert.equal(ExpertSkills.label('unknown'), '');
  assert.match(html, /ExpertSkills\.label\(activeExpertSkill\)/);
  assert.doesNotMatch(html, /activeExpertSkill === 'none' \? 'Expert skill off' : 'People & OD Expert active'/);
});

test('expert guidance adds zero tokens when off and only augments Agent requests', () => {
  const request = 'Assess this workforce plan.';
  const baseline = AgentMode.preparePrompt('agent', request);
  assert.equal(AgentMode.preparePrompt('agent', request, ExpertSkills.guidance('none', request)), baseline);
  const expert = AgentMode.preparePrompt('agent', request, ExpertSkills.guidance('people-od', request));
  assert.match(expert, /People & OD/);
  assert.match(expert, /Assess this workforce plan\./);
  assert.equal(AgentMode.preparePrompt('chat', request, ExpertSkills.guidance('people-od', request)), request);
});

test('expert skill selector is compact and wired to both Agent submission paths', () => {
  assert.match(html, /<script src="\.\/expert-skills\.js"><\/script>/);
  assert.match(html, /id="expertSkill"/);
  assert.match(html, /People &amp; OD Expert/);
  assert.match(html, /Corporate Communications Expert/);
  assert.match(html, /ExpertSkills\.load\(localStorage\)/);
  assert.match(html, /ExpertSkills\.save\(localStorage, expertSkillSelect\.value\)/);
  assert.match(html, /const expertSkill = mode === 'agent' \? activeExpertSkill : 'none'/);
  assert.match(html, /ExpertSkills\.guidance\(expertSkill, promptText\)/);
  assert.match(html, /queuedExpertSkill=expertSkill/);
  assert.match(html, /expertSkillSelect\.hidden = isHome \|\| isActions \|\| !isAgent/);
});

test('approval queue serializes decisions and safety gate persists until confirmed clear', () => {
  const queue = ApprovalQueue.create();
  const first = queue.enqueue({ command: 'first' });
  const second = queue.enqueue({ command: 'second' });
  assert.equal(queue.current().token, first);
  assert.equal(queue.consume(second), false);
  assert.equal(queue.consume(first), true);
  assert.equal(queue.current().token, second);
  queue.clear();
  const later = queue.enqueue({ command: 'later' });
  assert.equal(queue.isCurrent(second), false);
  assert.equal(queue.isCurrent(later), true);

  const values = new Map();
  const storage = { getItem:key => values.get(key) || null, setItem:(key,value) => values.set(key,value), removeItem:key => values.delete(key) };
  const gate = ApprovalQueue.createSafetyGate(storage, 'test-interrupt');
  assert.equal(gate.isRequired(), false);
  gate.require();
  assert.equal(gate.isRequired(), true);
  assert.equal(ApprovalQueue.createSafetyGate(storage, 'test-interrupt').isRequired(), true);
  gate.clear();
  assert.equal(gate.isRequired(), false);
});

test('Agent HQ derives specialist activity only from real gateway events', () => {
  let state = AgentHQ.createState();
  assert.equal(state.phase, 'idle');
  assert.equal(state.agents.every((agent) => agent.status === 'idle'), true);

  state = AgentHQ.reduce(state, 'message.start', { request: 'Research competitors', run_id: 'run-1' }, 1000);
  assert.equal(state.phase, 'working');
  assert.equal(state.agents.find((agent) => agent.id === 'orchestrator').status, 'active');

  state = AgentHQ.reduce(state, 'tool.start', { name: 'browser_navigate', call_id: 'research-1', run_id: 'run-1' }, 2000);
  assert.equal(state.agents.find((agent) => agent.id === 'research').status, 'active');
  assert.equal(state.toolCount, 1);

  state = AgentHQ.reduce(state, 'tool.start', { name: 'patch', call_id: 'builder-1', run_id: 'run-1' }, 3000);
  assert.equal(state.agents.find((agent) => agent.id === 'research').status, 'active');
  assert.equal(state.agents.find((agent) => agent.id === 'builder').status, 'active');

  const beforeStaleCompletion = state;
  state = AgentHQ.reduce(state, 'tool.complete', { name: 'patch', call_id: 'stale-builder', run_id: 'run-1' }, 3200);
  assert.equal(state, beforeStaleCompletion);

  state = AgentHQ.reduce(state, 'tool.complete', { name: 'browser_navigate', call_id: 'research-1', run_id: 'run-1' }, 3500);
  assert.equal(state.agents.find((agent) => agent.id === 'builder').status, 'active');
  assert.equal(state.activeRole, 'builder');

  state = AgentHQ.reduce(state, 'tool.start', { name: 'test_runner', call_id: 'review-1', run_id: 'run-1' }, 4000);
  assert.equal(state.agents.find((agent) => agent.id === 'reviewer').status, 'active');

  const active = state;
  assert.equal(AgentHQ.reduce(state, 'message.start', { request:'Old task', run_id:'old-run' }, 4100), active);
  assert.equal(AgentHQ.reduce(state, 'message.start', { request:'Unidentified task' }, 4200), active);
});

test('Agent HQ reflects approval, completion, and bounded activity history', () => {
  let state = AgentHQ.createState();
  state = AgentHQ.reduce(state, 'approval.request', { description: 'Run a command' }, 1000);
  assert.equal(state.phase, 'waiting');
  assert.equal(state.agents.find((agent) => agent.id === 'orchestrator').status, 'waiting');

  for (let i = 0; i < 15; i += 1) {
    state = AgentHQ.reduce(state, 'tool.start', { name: 'read_file' }, 2000 + i);
  }
  assert.equal(state.activity.length <= 12, true);

  state = AgentHQ.reduce(state, 'message.complete', { status: 'completed', run_id: 'run-1' }, 5000);
  assert.equal(state.phase, 'complete');
  assert.equal(state.agents.every((agent) => agent.status !== 'active'), true);
  const completed = state;
  state = AgentHQ.reduce(state, 'tool.start', { name: 'patch', call_id: 'late-1', run_id: 'run-1' }, 6000);
  assert.deepEqual(state, completed);
  assert.equal(AgentHQ.reduce(state, 'message.start', {request:'Late old run', run_id:'run-1'}, 6100), completed);
  assert.equal(AgentHQ.reduce(state, 'message.start', {request:'Unidentified late run'}, 6200), completed);
  state = AgentHQ.reduce(state, 'message.start', {request:'New run', run_id:'run-2'}, 6300);
  assert.equal(state.runId, 'run-2');
  assert.equal(state.phase, 'working');
});

test('Agent HQ uses confirmed session state without synthesizing a message start', () => {
  let state = AgentHQ.createState();
  state = AgentHQ.reduce(state, 'session.running', {}, 1000);
  assert.equal(state.phase, 'working');
  assert.equal(state.task, 'Running session');
  assert.equal(state.toolCount, 0);
  const waiting = AgentHQ.reduce(state, 'approval.request', {description:'Confirm'}, 1100);
  assert.equal(AgentHQ.reduce(waiting, 'session.running', {}, 1200), waiting);
  const submitHandler = html.slice(html.indexOf("$('#composer').addEventListener('submit'"), html.indexOf('bindPromptButtons();'));
  const restoreHandler = html.slice(html.indexOf('function restoreRunningAgentState'), html.indexOf('function setStatus'));
  assert.doesNotMatch(submitHandler, /updateAgentHQ\('message\.start'/);
  assert.doesNotMatch(restoreHandler, /updateAgentHQ\('message\.start'/);
});

test('Agent HQ is a first-class BRAINY view wired to live gateway events', () => {
  assert.match(html, /id="hqMode"[^>]*>HQ<\/button>/);
  assert.match(html, /id="agentHQ"/);
  assert.match(html, /id="hqAgents"/);
  assert.match(html, /id="hqActivity"/);
  assert.match(html, /BrainyAgentHQ\.reduce\(hqState, type, payload/);
  assert.match(html, /updateAgentHQ\(type, eventPayload\)/);
  assert.match(html, /run_id:\s*payload\.run_id \|\| ev\.run_id/);
  assert.match(html, /<script src="\.\/agent-hq\.js"><\/script>/);
  assert.match(html, /function invalidateLiveSession\(\)[\s\S]*resetAgentHQ\(\)/);
  assert.match(html, /function resetAgentHQ\(\)[\s\S]*BrainyAgentHQ\.createState\(\)/);
});

test('Agent HQ collapses cleanly for phone-width screens', () => {
  assert.match(html, /\.agent-hq \{[^}]*width:min\(860px,100%\)/);
  assert.match(html, /@media \(max-width:900px\)[\s\S]*\.hq-grid \{ grid-template-columns:1fr; \}/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.hq-summary \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\); \}/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.hq-agents \{ grid-template-columns:1fr; \}/);
});

test('agent mode UI exposes an explicit mode switch and compact task progress', () => {
  assert.match(html, /<script src="\.\/agent-mode\.js"><\/script>/);
  assert.match(html, /id="chatMode"/);
  assert.match(html, /id="agentMode"/);
  assert.match(html, /id="agentRunbar"[^>]+aria-live="polite"/);
  assert.match(html, /const mode = queuedMode/);
  assert.match(html, /AgentMode\.preparePrompt\(mode, projectPrompt/);
  assert.equal((html.match(/AgentMode\.preparePrompt\(mode, projectPrompt/g) || []).length, 2);
  assert.match(html, /type === 'tool\.start'/);
  assert.match(html, /type === 'tool\.complete'/);
});

test('blocking prompts stay reachable from HQ and approval failures fail closed', () => {
  const approvalHandler = html.slice(html.indexOf('function showNextApproval'), html.indexOf('function queueApprovalRequest'));
  const closeHandler = html.slice(html.indexOf('ws.onclose'), html.indexOf('ws.onerror'));
  assert.match(html, /function revealBlockingRequest\(\)/);
  assert.match(html, /type === 'clarify\.request'[\s\S]*revealBlockingRequest\(\)/);
  assert.match(html, /type === 'approval\.request'[\s\S]*revealBlockingRequest\(\)/);
  assert.match(html, /id="stopAgent"/);
  assert.match(html, /rpc\('session\.interrupt',\{session_id:sid\}\)/);
  assert.match(html, /queueApprovalRequest\(payload\)/);
  assert.match(approvalHandler, /approvalQueue\.isCurrent\(token\)/);
  assert.match(approvalHandler, /if \(!ws \|\| ws\.readyState !== WebSocket\.OPEN\)/);
  assert.match(approvalHandler, /if \(Number\(result && result\.resolved\) !== 1\)/);
  assert.match(approvalHandler, /handleIndeterminateBlockingResponse\(error\)/);
  assert.doesNotMatch(closeHandler, /invalidateApprovals\(\)/);
  assert.match(html, /busy = !!result\.running;[\s\S]*if \(!result\.running\) \{[\s\S]*safetyGate\.clear\(\)/);
  assert.match(html, /function handleIndeterminateBlockingResponse\(error\)[\s\S]*safetyGate\.require\(\)[\s\S]*enforceSafetyInterrupt\(\)/);
  assert.match(html, /async function enforceSafetyInterrupt\(\)[\s\S]*safetyGate\.isRequired\(\)[\s\S]*rpc\('session\.interrupt'[\s\S]*safetyGate\.clear\(\)/);
  assert.match(html, /const clarificationQueue = BrainyApprovalQueue\.create\(\)/);
  assert.match(html, /function showNextClarification\(\)/);
  assert.match(html, /clarificationQueue\.isCurrent\(token\)/);
  assert.match(html, /await rpc\('clarify\.respond'/);
  assert.match(html, /clarificationQueue\.consume\(token\)/);
  assert.match(html, /handleIndeterminateBlockingResponse\(error\)/);
  assert.match(html, /respond\('once'\)/);
  assert.match(html, /respond\('deny'\)/);
  assert.doesNotMatch(html, /allow_permanent/);
});

test('safety gate blocks session switching and retries the original resume until interrupt is confirmed', () => {
  const historyHandler = html.slice(html.indexOf('async function openHistorySession'), html.indexOf('async function startNewSession'));
  const newHandler = html.slice(html.indexOf('async function startNewSession'), html.indexOf('async function submitPrompt'));
  const startHandler = html.slice(html.indexOf('async function startSession'), html.indexOf('function event'));
  const stopHandler = html.slice(html.indexOf('stopAgent.onclick'), html.indexOf('renderInteractionMode();', html.indexOf('stopAgent.onclick')));
  assert.match(historyHandler, /safetyGate\.isRequired\(\)/);
  assert.match(newHandler, /safetyGate\.isRequired\(\)/);
  assert.match(startHandler, /catch \(error\) \{ if \(safetyGate\.isRequired\(\)\) throw error;/);
  assert.match(stopHandler, /handleIndeterminateBlockingResponse\(error\)/);
});

test('running sessions restore a visible stop control independent of local mode', () => {
  assert.match(html, /function restoreRunningAgentState\(running\)/);
  assert.match(html, /activeRunMode = 'agent'/);
  assert.match(html, /restoreRunningAgentState\(result\.running\)/);
});

test('Mac companion status is honest until a local desktop runtime is paired', () => {
  assert.match(html, /id="companionStatus"/);
  assert.match(html, /Mac not connected/);
  assert.match(html, /requires BRAINY Companion on your Mac/);
});

test('bridge keeps all backend calls on the dynamic tunnel', () => {
  assert.match(html, /let backendUrl/);
  assert.match(html, /fetch\(`\$\{backendUrl\}\/api\/auth\/ws-ticket`/);
  assert.match(html, /fetch\(`\$\{backendUrl\}\/api\/brainy\/codex-usage`/);
  assert.match(html, /fetch\(`\$\{backendUrl\}\/api\/brainy\/codex-accounts`/);
  assert.match(html, /new WebSocket\(`\$\{proto\}\/\/\$\{wsBackend\.host\}/);
});

test('account control shows safe Codex credentials and supports deliberate switching', () => {
  assert.match(html, /id="accountControl"/);
  assert.match(html, /id="accountList"/);
  assert.match(html, /Use account/);
  assert.match(html, /method:'POST'/);
  assert.match(html, /Switching restarts BRAINY and reconnects this workspace/);
  assert.doesNotMatch(html, /access_token|refresh_token/);
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
  assert.match(html, /serviceWorker\.register\('\.\/sw\.js\?v=37'/);
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
  assert.match(html, /visibleUserText\(message\.text\)/);
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

test('adaptive app shell uses extra desktop and browser zoom space without fixed-width islands', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
  assert.match(html, /--workspace-max:1600px/);
  assert.match(html, /\.workspace-shell \{[^}]*grid-template-columns:minmax\(0,var\(--workspace-max\)\);/);
  assert.match(html, /\.workspace-shell\.history-open \{[^}]*grid-template-columns:clamp\(230px,18vw,300px\) minmax\(0,1fr\);/);
  assert.match(html, /\.app \{[^}]*max-width:none;/);
  assert.match(html, /@container workspace \(min-width:1200px\)/);
});

test('density control is local, persistent, and offers compact comfortable and spacious layouts', () => {
  assert.match(html, /id="densityBtn"/);
  assert.match(html, /const densityOrder = \['compact','comfortable','spacious'\]/);
  assert.match(html, /localStorage\.getItem\('brainy_density'\)/);
  assert.match(html, /localStorage\.setItem\('brainy_density', density\)/);
  assert.match(html, /document\.documentElement\.dataset\.density = density/);
  assert.match(html, /:root\[data-density="compact"\]/);
  assert.match(html, /:root\[data-density="spacious"\]/);
});

test('projects and chats can collapse independently and remember their sidebar state', () => {
  assert.match(html, /id="projectsToggle"[^>]+aria-expanded="true"/);
  assert.match(html, /id="chatsToggle"[^>]+aria-expanded="true"/);
  assert.match(html, /id="chatsSection"/);
  assert.match(html, /const CHATS_COLLAPSED_KEY = 'brainy_chats_collapsed'/);
  assert.match(html, /localStorage\.setItem\(CHATS_COLLAPSED_KEY, String\(chatsCollapsed\)\)/);
  assert.match(html, /historyList\.hidden = chatsCollapsed/);
  assert.match(html, /chatsToggle\.setAttribute\('aria-expanded', String\(!chatsCollapsed\)\)/);
});

test('jump-to-latest appears only away from the bottom and scrolls without AI', () => {
  assert.match(html, /id="jumpLatest"/);
  assert.match(html, /function isNearBottom\(\)/);
  assert.match(html, /scroller\.scrollHeight - scroller\.scrollTop - scroller\.clientHeight/);
  assert.match(html, /const hasMessages = Boolean\(thread\.querySelector\('\.message'\)\)/);
  assert.match(html, /scroller\.addEventListener\('scroll', updateJumpLatest/);
  assert.match(html, /jumpLatest\.onclick = scrollBottom/);
  assert.match(html, /\.jump-latest\[hidden\] \{ display:none; \}/);
});

test('history sidebar becomes a closable drawer on narrow screens', () => {
  assert.match(html, /@media \(max-width:900px\)[\s\S]*\.history-panel \{[^}]*position:fixed;[^}]*transform:translateX\(-105%\);/);
  assert.match(html, /\.history-panel\.open \{ transform:translateX\(0\); \}/);
  assert.match(html, /id="historyBackdrop"/);
  assert.match(html, /function toggleHistory\(open\)/);
});

test('history can be hidden and reopened on desktop with its state remembered', () => {
  assert.match(html, /\.workspace-shell\.history-open \{[^}]*grid-template-columns:clamp\(230px,18vw,300px\) minmax\(0,1fr\);/);
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
  assert.match(sw, /brainy-shell-v37/);
  assert.doesNotMatch(sw, /local-tools/);
  assert.match(sw, /\.\/home-dashboard\.js/);
  assert.match(sw, /\.\/action-center\.js/);
  assert.match(sw, /\.\/expert-skills\.js/);
  assert.match(sw, /response\.ok/);
  assert.match(sw, /event\.request\.mode === 'navigate'/);
  assert.match(sw, /Response\.error\(\)/);
  assert.match(sw, /session-actions\.js/);
  assert.match(sw, /approval-queue\.js/);
  assert.match(sw, /agent-hq\.js/);
  assert.match(sw, /project-store\.js/);
  assert.match(sw, /command-palette\.js/);
  assert.match(sw, /agent-mode\.js/);
  assert.match(sw, /markdown-renderer\.js/);
  assert.match(sw, /index\.html/);
  assert.match(sw, /manifest\.webmanifest/);
});
