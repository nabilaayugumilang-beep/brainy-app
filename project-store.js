(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProjectStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KEY = 'brainy_projects_v1';
  const MAX_NAME = 40;
  const MAX_DESCRIPTION = 160;
  const MAX_INSTRUCTIONS = 1200;
  const MAX_CHAT_TITLE = 80;
  const CONTEXT_OPEN = '[[BRAINY_PROJECT_CONTEXT]]';
  const CONTEXT_CLOSE = '[[/BRAINY_PROJECT_CONTEXT]]';

  function empty() {
    return { version: 2, projects: [], assignments: {}, chatMeta: {}, selected: 'all', collapsed: false };
  }

  function cleanName(value) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name) throw new Error('Project name is required');
    if (name.length > MAX_NAME) throw new Error(`Project names can have up to ${MAX_NAME} characters`);
    return name;
  }

  function cleanDescription(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION);
  }

  function cleanInstructions(value) {
    return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_INSTRUCTIONS);
  }

  function cleanChatTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_TITLE);
  }

  function uniqueName(projects, value, exceptId) {
    const base = cleanName(value);
    const used = new Set(
      projects
        .filter(project => project.id !== exceptId)
        .map(project => project.name.toLocaleLowerCase())
    );
    if (!used.has(base.toLocaleLowerCase())) return base;
    let number = 2;
    while (used.has(`${base} (${number})`.toLocaleLowerCase())) number += 1;
    const suffix = ` (${number})`;
    return `${base.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`;
  }

  function normalize(value) {
    if (!value || typeof value !== 'object') return empty();
    const projects = [];
    const seenIds = new Set();
    for (const raw of Array.isArray(value.projects) ? value.projects : []) {
      const id = String(raw && raw.id || '').trim();
      if (!id || seenIds.has(id)) continue;
      let name;
      try { name = uniqueName(projects, raw.name); } catch { continue; }
      seenIds.add(id);
      projects.push({
        id,
        name,
        description: cleanDescription(raw.description),
        instructions: cleanInstructions(raw.instructions),
        createdAt: Number(raw.createdAt) || Date.now()
      });
    }
    const assignments = {};
    if (value.assignments && typeof value.assignments === 'object') {
      for (const [sessionId, projectId] of Object.entries(value.assignments)) {
        if (sessionId && seenIds.has(String(projectId))) assignments[sessionId] = String(projectId);
      }
    }
    const chatMeta = {};
    if (value.chatMeta && typeof value.chatMeta === 'object') {
      for (const [sessionId, rawMeta] of Object.entries(value.chatMeta)) {
        const title = cleanChatTitle(rawMeta && rawMeta.title);
        const pinned = Boolean(rawMeta && rawMeta.pinned);
        if (sessionId && (title || pinned)) chatMeta[sessionId] = { ...(title ? { title } : {}), ...(pinned ? { pinned: true } : {}) };
      }
    }
    const selectedRaw = String(value.selected || 'all');
    const selected = selectedRaw === 'all' || selectedRaw === 'none' || seenIds.has(selectedRaw)
      ? selectedRaw
      : 'all';
    return { version: 2, projects, assignments, chatMeta, selected, collapsed: Boolean(value.collapsed) };
  }

  function load(storage) {
    try {
      const raw = storage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : empty();
    } catch {
      return empty();
    }
  }

  function save(storage, state) {
    const next = normalize(state);
    storage.setItem(KEY, JSON.stringify(next));
    return next;
  }

  function create(state, value, id, createdAt) {
    const current = normalize(state);
    const projectId = String(id || `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    if (current.projects.some(project => project.id === projectId)) throw new Error('Project id is already in use');
    const project = {
      id: projectId,
      name: uniqueName(current.projects, value),
      description: '',
      instructions: '',
      createdAt: Number(createdAt) || Date.now()
    };
    return { ...current, projects: [...current.projects, project], selected: projectId };
  }

  function rename(state, projectId, value) {
    const current = normalize(state);
    if (!current.projects.some(project => project.id === projectId)) throw new Error('Project not found');
    const name = uniqueName(current.projects, value, projectId);
    return {
      ...current,
      projects: current.projects.map(project => project.id === projectId ? { ...project, name } : project)
    };
  }

  function updateDetails(state, projectId, details) {
    const current = normalize(state);
    if (!current.projects.some(project => project.id === projectId)) throw new Error('Project not found');
    const description = cleanDescription(details && details.description);
    const instructions = cleanInstructions(details && details.instructions);
    return {
      ...current,
      projects: current.projects.map(project => project.id === projectId
        ? { ...project, description, instructions }
        : project)
    };
  }

  function remove(state, projectId) {
    const current = normalize(state);
    const projects = current.projects.filter(project => project.id !== projectId);
    const assignments = Object.fromEntries(
      Object.entries(current.assignments).filter(([, assignedId]) => assignedId !== projectId)
    );
    return {
      ...current,
      projects,
      assignments,
      selected: current.selected === projectId ? 'all' : current.selected
    };
  }

  function assign(state, sessionId, projectId) {
    const current = normalize(state);
    const storedId = String(sessionId || '').trim();
    if (!storedId) throw new Error('Chat not found');
    const assignments = { ...current.assignments };
    if (projectId == null || projectId === 'none') {
      delete assignments[storedId];
    } else {
      if (!current.projects.some(project => project.id === projectId)) throw new Error('Project not found');
      assignments[storedId] = projectId;
    }
    return { ...current, assignments };
  }

  function removeSession(state, sessionId) {
    const current = normalize(state);
    const storedId = String(sessionId || '');
    const assignments = { ...current.assignments };
    const chatMeta = { ...current.chatMeta };
    delete assignments[storedId];
    delete chatMeta[storedId];
    return { ...current, assignments, chatMeta };
  }

  function renameSession(state, sessionId, value) {
    const current = normalize(state);
    const storedId = String(sessionId || '').trim();
    if (!storedId) throw new Error('Chat not found');
    const title = cleanChatTitle(value);
    const chatMeta = { ...current.chatMeta };
    if (title) chatMeta[storedId] = { ...(chatMeta[storedId] || {}), title };
    else if (chatMeta[storedId] && chatMeta[storedId].pinned) chatMeta[storedId] = { pinned: true };
    else delete chatMeta[storedId];
    return { ...current, chatMeta };
  }

  function setPinned(state, sessionId, pinned) {
    const current = normalize(state);
    const storedId = String(sessionId || '').trim();
    if (!storedId) throw new Error('Chat not found');
    const chatMeta = { ...current.chatMeta };
    const previous = chatMeta[storedId] || {};
    if (pinned) chatMeta[storedId] = { ...previous, pinned: true };
    else if (previous.title) chatMeta[storedId] = { title: previous.title };
    else delete chatMeta[storedId];
    return { ...current, chatMeta };
  }

  function isPinned(state, sessionId) {
    return Boolean((normalize(state).chatMeta[String(sessionId || '')] || {}).pinned);
  }

  function sortSessions(state, items) {
    const current = normalize(state);
    return (Array.isArray(items) ? items : [])
      .map((item, index) => ({ item, index, pinned: Boolean((current.chatMeta[String(item && item.id || '')] || {}).pinned) }))
      .sort((left, right) => Number(right.pinned) - Number(left.pinned) || left.index - right.index)
      .map(entry => entry.item);
  }

  function filterSessions(state, items, query) {
    const current = normalize(state);
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle) return Array.isArray(items) ? [...items] : [];
    return (Array.isArray(items) ? items : []).filter(item => {
      const storedId = String(item && item.id || '');
      const customTitle = (current.chatMeta[storedId] || {}).title || '';
      const haystack = [customTitle, item && item.title, stripProjectContext(item && item.preview)]
        .map(value => String(value || '').toLocaleLowerCase())
        .join('\n');
      return haystack.includes(needle);
    });
  }

  function applyProjectContext(state, sessionId, text) {
    const current = normalize(state);
    const projectId = current.assignments[String(sessionId || '')];
    const project = current.projects.find(item => item.id === projectId);
    const request = String(text || '');
    if (!project || (!project.description && !project.instructions)) return request;
    const lines = [CONTEXT_OPEN, `Project: ${project.name}`];
    if (project.description) lines.push(`Description: ${project.description}`);
    if (project.instructions) lines.push('Instructions:', project.instructions);
    lines.push(CONTEXT_CLOSE, '', request);
    return lines.join('\n');
  }

  function prepareFirstPrompt(state, sessionId, text, firstMessagePending) {
    const request = String(text || '');
    return firstMessagePending ? applyProjectContext(state, sessionId, request) : request;
  }

  function stripProjectContext(text) {
    const value = String(text || '');
    if (!value.startsWith(CONTEXT_OPEN)) return value;
    const marker = `${CONTEXT_CLOSE}\n\n`;
    const end = value.indexOf(marker);
    return end === -1 ? value : value.slice(end + marker.length);
  }

  function sessionTitle(state, sessionId, fallback) {
    const current = normalize(state);
    return (current.chatMeta[String(sessionId || '')] || {}).title || String(fallback || '');
  }

  function select(state, selected) {
    const current = normalize(state);
    const value = String(selected || 'all');
    if (value !== 'all' && value !== 'none' && !current.projects.some(project => project.id === value)) {
      throw new Error('Project not found');
    }
    return { ...current, selected: value };
  }

  function setCollapsed(state, collapsed) {
    return { ...normalize(state), collapsed: Boolean(collapsed) };
  }

  function projectForSession(state, sessionId) {
    return normalize(state).assignments[String(sessionId || '')] || null;
  }

  function projectById(state, projectId) {
    return normalize(state).projects.find(project => project.id === projectId) || null;
  }

  return {
    KEY,
    empty,
    load,
    save,
    create,
    rename,
    updateDetails,
    remove,
    assign,
    removeSession,
    renameSession,
    setPinned,
    isPinned,
    sortSessions,
    filterSessions,
    applyProjectContext,
    prepareFirstPrompt,
    stripProjectContext,
    sessionTitle,
    select,
    setCollapsed,
    projectForSession,
    projectById
  };
});
