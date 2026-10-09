(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrainyLocalToolsUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function markup() { return `
    <div class="local-head">
      <div><span class="home-kicker">Private command center</span><h1 id="localToolsTitle">Local Tools</h1><p>Tasks, notes, decisions, templates, focus, and search. Stored only on this device.</p></div>
      <span class="local-badge">0 AI tokens</span>
    </div>
    <div class="local-search-wrap">
      <input class="local-search" id="localSearch" type="search" placeholder="Search everything saved locally…" autocomplete="off">
      <span class="local-search-key">⌘ / Ctrl K</span>
    </div>
    <div class="local-search-results" id="localSearchResults" aria-live="polite"></div>
    <div class="local-insights" id="localInsights"></div>
    <section class="home-panel" aria-labelledby="localPinsTitle">
      <div class="home-panel-head"><h2 id="localPinsTitle">Pinned command center</h2><span class="home-panel-meta">Favorites</span></div>
      <div class="home-list" id="localPins"></div>
    </section>
    <nav class="local-tabs" aria-label="Local tools">
      <button class="local-tab active" type="button" data-local-panel="tasks">Kanban</button>
      <button class="local-tab" type="button" data-local-panel="notes">Notes</button>
      <button class="local-tab" type="button" data-local-panel="templates">Templates</button>
      <button class="local-tab" type="button" data-local-panel="clips">Clipboard</button>
      <button class="local-tab" type="button" data-local-panel="decisions">Decisions</button>
      <button class="local-tab" type="button" data-local-panel="focus">Focus</button>
      <button class="local-tab" type="button" data-local-panel="settings">Settings</button>
    </nav>
    <section class="local-panel" data-local-view="tasks">
      <div class="local-panel-head"><h2>Local Kanban</h2><span class="local-meta">Drag cards between columns</span></div>
      <form class="local-form" id="taskForm">
        <input class="local-input wide" name="title" required maxlength="180" placeholder="Task title">
        <select class="local-input" name="status"><option value="backlog">Backlog</option><option value="today">Today</option><option value="doing">Doing</option><option value="done">Done</option></select>
        <select class="local-input" name="priority"><option value="medium">Medium priority</option><option value="high">High priority</option><option value="low">Low priority</option></select>
        <input class="local-input" name="due" type="date">
        <input class="local-input" name="projectId" maxlength="100" placeholder="Project / area">
        <textarea class="local-input wide" name="checklist" rows="2" placeholder="Checklist · one item per line"></textarea>
        <button class="local-submit" type="submit">Add task</button>
      </form>
      <div class="local-board" id="localBoard">
        <section class="kanban-column" data-task-status="backlog"><h3>Backlog</h3><div class="local-list" id="board-backlog"></div></section>
        <section class="kanban-column" data-task-status="today"><h3>Today</h3><div class="local-list" id="board-today"></div></section>
        <section class="kanban-column" data-task-status="doing"><h3>Doing</h3><div class="local-list" id="board-doing"></div></section>
        <section class="kanban-column" data-task-status="done"><h3>Done</h3><div class="local-list" id="board-done"></div></section>
      </div>
    </section>
    <section class="local-panel" data-local-view="notes" hidden>
      <div class="local-panel-head"><h2>Scratchpad & Quick Notes</h2><span class="local-meta">Private and local</span></div>
      <form class="local-form" id="noteForm"><input class="local-input" name="title" maxlength="180" placeholder="Note title"><textarea class="local-input wide" name="body" required rows="4" placeholder="Write a private note…"></textarea><button class="local-submit" type="submit">Save note</button></form>
      <div class="local-list" id="noteList"></div>
    </section>
    <section class="local-panel" data-local-view="templates" hidden>
      <div class="local-panel-head"><h2>Template Library</h2><span class="local-meta">Use {audience}, {deadline}, or any variable</span></div>
      <form class="local-form" id="templateForm"><input class="local-input" name="title" required maxlength="180" placeholder="Template name"><textarea class="local-input wide" name="body" required rows="4" placeholder="Template text with {variables}"></textarea><button class="local-submit" type="submit">Save template</button></form>
      <div class="local-list" id="templateList"></div>
    </section>
    <section class="local-panel" data-local-view="clips" hidden>
      <div class="local-panel-head"><h2>Clipboard Shelf</h2><span class="local-meta">Clipboard access only when you press Copy</span></div>
      <form class="local-form" id="clipForm"><textarea class="local-input wide" name="text" required rows="3" placeholder="Paste or save reusable text…"></textarea><button class="local-submit" type="submit">Add clip</button></form>
      <div class="local-list" id="clipList"></div>
    </section>
    <section class="local-panel" data-local-view="decisions" hidden>
      <div class="local-panel-head"><h2>Decision Log</h2><span class="local-meta">Reason, owner, and follow-up</span></div>
      <form class="local-form" id="decisionForm"><input class="local-input" name="title" required maxlength="180" placeholder="Decision"><input class="local-input" name="owner" maxlength="120" placeholder="Owner"><input class="local-input" name="due" type="date"><textarea class="local-input wide" name="reason" rows="3" placeholder="Why this decision?"></textarea><textarea class="local-input wide" name="followUp" rows="3" placeholder="Follow-up"></textarea><button class="local-submit" type="submit">Log decision</button></form>
      <div class="local-list" id="decisionList"></div>
    </section>
    <section class="local-panel" id="focusPanel" data-local-view="focus" hidden>
      <div class="local-panel-head"><h2>Focus Mode</h2><span class="local-meta">Local countdown</span></div>
      <form class="local-form" id="focusForm"><input class="local-input wide" name="label" maxlength="80" placeholder="What are you focusing on?"><input class="local-input" name="minutes" type="number" min="1" max="120" value="25"><button class="local-submit" type="submit">Start focus</button></form>
      <div class="focus-display"><div><div class="focus-clock" id="focusClock">25:00</div><div class="focus-label" id="focusLabel">Ready to focus</div><button class="local-mini danger" id="focusStop" type="button">Stop</button></div></div>
    </section>
    <section class="local-panel" id="localSettings" data-local-view="settings" hidden>
      <div class="local-panel-head"><h2>Personalize</h2><span class="local-meta">This device only</span></div>
      <div class="local-settings-grid">
        <label class="local-setting"><span><strong>Private mode</strong><br><span class="local-meta">Blur note and clipboard previews</span></span><input id="privateModeToggle" type="checkbox"></label>
        <label class="local-setting"><span><strong>Pinned widget on Home</strong></span><input id="pinsWidgetToggle" type="checkbox"></label>
        <label class="local-setting"><span><strong>Insights widget on Home</strong></span><input id="insightsWidgetToggle" type="checkbox"></label>
        <button class="local-submit" id="enableReminders" type="button">Enable browser reminders</button>
      </div>
    </section>`; }
  function mount(root) { if (!root) return; root.innerHTML=markup(); }
  return {markup,mount};
});
