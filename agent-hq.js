(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BrainyAgentHQ = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFINITIONS = Object.freeze([
    { id: 'orchestrator', role: 'Orchestrator', short: 'O', purpose: 'Plans and coordinates' },
    { id: 'research', role: 'Research', short: 'R', purpose: 'Finds live sources' },
    { id: 'analyst', role: 'Analyst', short: 'A', purpose: 'Reads and connects evidence' },
    { id: 'builder', role: 'Builder', short: 'B', purpose: 'Creates and executes' },
    { id: 'reviewer', role: 'Reviewer', short: 'Q', purpose: 'Tests and verifies' }
  ]);

  function freshAgents() {
    return DEFINITIONS.map((agent) => ({ ...agent, status: 'idle', detail: 'Available' }));
  }

  function createState() {
    return {
      phase: 'idle', task: 'No active task', startedAt: null, updatedAt: null,
      toolCount: 0, approvalCount: 0, activeRole: null, runId: null,
      terminal: false, inFlight: [], agents: freshAgents(), activity: []
    };
  }

  function clean(value, fallback) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return (text || fallback).slice(0, 160);
  }

  function specialistFor(toolName) {
    const name = String(toolName || '').toLowerCase();
    if (/test|review|verify|lint|vision/.test(name)) return 'reviewer';
    if (/browser|web|arxiv|maps|search_news/.test(name)) return 'research';
    if (/read|search_files|session_search|extract|parse/.test(name)) return 'analyst';
    if (/terminal|execute|patch|write|process|git|github|deploy|image_generate/.test(name)) return 'builder';
    return 'orchestrator';
  }

  function runIdOf(data) {
    const value = data.run_id || data.turn_id || data.message_id;
    return value == null ? null : String(value);
  }

  function callIdOf(data, tool, at) {
    const value = data.call_id || data.tool_call_id || data.invocation_id || data.id;
    return value == null ? `${tool}:${at}` : String(value);
  }

  function belongsToRun(state, data) {
    const eventRunId = runIdOf(data);
    if (!state.runId) return true;
    return Boolean(eventRunId && state.runId === eventRunId);
  }

  function agentsFrom(inFlight, completed) {
    return DEFINITIONS.map((definition) => {
      const active = [...inFlight].reverse().find((item) => item.roleId === definition.id);
      if (active) return { ...definition, status: 'active', detail: active.detail };
      if (completed && completed.roleId === definition.id) {
        return { ...definition, status: completed.failed ? 'error' : 'complete', detail: completed.detail };
      }
      return { ...definition, status: 'idle', detail: 'Available' };
    });
  }

  function record(state, at, role, label, tone) {
    const item = { id: `${at}-${state.toolCount}-${state.approvalCount}`, at, role, label, tone: tone || 'neutral' };
    return [item, ...state.activity].slice(0, 12);
  }

  function reduce(previous, type, payload, timestamp) {
    const state = previous || createState();
    const data = payload || {};
    const at = Number.isFinite(timestamp) ? timestamp : Date.now();

    if (type === 'message.start') {
      const incomingRunId = runIdOf(data);
      const active = (state.phase === 'working' || state.phase === 'waiting') && !state.terminal;
      if (state.runId && (!incomingRunId || incomingRunId === state.runId || active)) return state;
      if (active && !state.runId && !incomingRunId) return state;
      if (state.terminal && !incomingRunId) return state;
      const task = clean(data.request || data.content || data.message, 'Agent task in progress');
      const next = {
        ...state, phase: 'working', task, startedAt: at, updatedAt: at,
        toolCount: 0, approvalCount: 0, activeRole: 'orchestrator',
        runId: runIdOf(data), terminal: false, inFlight: []
      };
      return {
        ...next,
        agents: freshAgents().map((agent) => agent.id === 'orchestrator'
          ? { ...agent, status: 'active', detail: 'Planning the task' }
          : agent),
        activity: record(next, at, 'Orchestrator', 'Task started', 'active')
      };
    }

    if (type === 'session.running') {
      if ((state.phase === 'working' || state.phase === 'waiting') && !state.terminal) return state;
      const next = {
        ...state, phase: 'working', task: clean(data.task, 'Running session'),
        startedAt: data.started_at || null, updatedAt: at, activeRole: 'orchestrator',
        runId: runIdOf(data), terminal: false, inFlight: []
      };
      return {
        ...next,
        agents: freshAgents().map((agent) => agent.id === 'orchestrator'
          ? { ...agent, status: 'active', detail: 'Monitoring resumed session' }
          : agent),
        activity: record(next, at, 'Orchestrator', 'Running session resumed', 'active')
      };
    }

    if (state.terminal || !belongsToRun(state, data)) return state;

    if (type === 'tool.start') {
      const tool = clean(data.name || data.tool || data.tool_name, 'tool');
      const roleId = specialistFor(tool);
      const definition = DEFINITIONS.find((agent) => agent.id === roleId);
      const detail = roleId === 'orchestrator' ? `Coordinating ${tool}` : `Using ${tool}`;
      const callId = callIdOf(data, tool, at);
      const item = { callId, tool, roleId, detail, startedAt: at };
      const inFlight = [...state.inFlight.filter((entry) => entry.callId !== callId), item];
      const next = {
        ...state, phase: 'working', updatedAt: at, toolCount: state.toolCount + 1,
        activeRole: roleId, inFlight
      };
      return { ...next, agents: agentsFrom(inFlight), activity: record(next, at, definition.role, detail, 'active') };
    }

    if (type === 'tool.complete') {
      const tool = clean(data.name || data.tool || data.tool_name, 'Tool');
      const requestedId = data.call_id || data.tool_call_id || data.invocation_id || data.id;
      let index;
      if (requestedId != null) {
        index = state.inFlight.findIndex((item) => item.callId === String(requestedId));
      } else {
        const matches = state.inFlight
          .map((item, itemIndex) => ({ item, itemIndex }))
          .filter(({ item }) => item.tool.toLowerCase() === tool.toLowerCase());
        index = matches.length === 1 ? matches[0].itemIndex : -1;
      }
      if (index < 0) return state;
      const matched = state.inFlight[index];
      const inFlight = state.inFlight.filter((_, itemIndex) => itemIndex !== index);
      const failed = data.ok === false || data.status === 'error';
      const completed = { ...matched, failed, detail: failed ? `${tool} failed` : `${tool} complete` };
      const activeRole = inFlight.length ? inFlight[inFlight.length - 1].roleId : null;
      return {
        ...state, updatedAt: at, activeRole, inFlight,
        agents: agentsFrom(inFlight, completed),
        activity: record(state, at, DEFINITIONS.find((agent) => agent.id === matched.roleId).role, completed.detail, failed ? 'error' : 'complete')
      };
    }

    if (type === 'approval.request') {
      const label = clean(data.description || data.command, 'Approval required');
      const next = { ...state, phase: 'waiting', updatedAt: at, approvalCount: state.approvalCount + 1, activeRole: 'orchestrator' };
      const agents = agentsFrom(state.inFlight).map((agent) => agent.id === 'orchestrator'
        ? { ...agent, status: 'waiting', detail: 'Waiting for your approval' }
        : agent);
      return { ...next, agents, activity: record(next, at, 'Orchestrator', label, 'waiting') };
    }

    if (type === 'error') {
      const label = clean(data.message || data.error, 'Task error');
      return {
        ...state, phase: 'error', updatedAt: at, activeRole: 'orchestrator', terminal: true, inFlight: [],
        agents: freshAgents().map((agent) => agent.id === 'orchestrator' ? { ...agent, status: 'error', detail: label } : agent),
        activity: record(state, at, 'Orchestrator', label, 'error')
      };
    }

    if (type === 'message.complete') {
      const interrupted = data.status === 'interrupted';
      const label = interrupted ? 'Task stopped' : 'Task complete';
      return {
        ...state, phase: interrupted ? 'idle' : 'complete', updatedAt: at,
        activeRole: null, runId: state.runId || runIdOf(data), terminal: true, inFlight: [], agents: freshAgents(),
        activity: record(state, at, 'Orchestrator', label, interrupted ? 'neutral' : 'complete')
      };
    }

    return state;
  }

  return Object.freeze({ createState, reduce, specialistFor });
});
