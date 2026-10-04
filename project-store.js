(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProjectStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KEY = 'brainy_projects_v1';
  const MAX_NAME = 40;

  function empty() {
    return { version: 1, projects: [], assignments: {}, selected: 'all', collapsed: false };
  }

  function cleanName(value) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name) throw new Error('Project name is required');
    if (name.length > MAX_NAME) throw new Error(`Project names can have up to ${MAX_NAME} characters`);
    return name;
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
      projects.push({ id, name, createdAt: Number(raw.createdAt) || Date.now() });
    }
    const assignments = {};
    if (value.assignments && typeof value.assignments === 'object') {
      for (const [sessionId, projectId] of Object.entries(value.assignments)) {
        if (sessionId && seenIds.has(String(projectId))) assignments[sessionId] = String(projectId);
      }
    }
    const selectedRaw = String(value.selected || 'all');
    const selected = selectedRaw === 'all' || selectedRaw === 'none' || seenIds.has(selectedRaw)
      ? selectedRaw
      : 'all';
    return { version: 1, projects, assignments, selected, collapsed: Boolean(value.collapsed) };
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
    if (current.projects.some(project => project.id === projectId)) throw new Error('Project id sudah digunakan');
    const project = {
      id: projectId,
      name: uniqueName(current.projects, value),
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
    const assignments = { ...current.assignments };
    delete assignments[String(sessionId || '')];
    return { ...current, assignments };
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
    remove,
    assign,
    removeSession,
    select,
    setCollapsed,
    projectForSession,
    projectById
  };
});
