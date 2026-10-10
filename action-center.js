(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrainyActionCenter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'brainy_action_drafts';
  const MAX_REQUEST_CHARS = 4000;
  const MAX_CONTEXT_CHARS = 6000;
  const DEFINITIONS = [
    {
      id:'brainstorm', title:'Brainstorm', description:'Explore ideas, options, and blind spots before deciding.',
      mode:'chat', expertSkill:'none', requestPlaceholder:'What are you thinking about?',
      contextPlaceholder:'Optional facts, links, constraints, or background'
    },
    {
      id:'draft', title:'Draft', description:'Turn an idea or brief into a clear first draft.',
      mode:'agent', expertSkill:'none', requestPlaceholder:'What should BRAINY draft?',
      contextPlaceholder:'Optional audience, tone, source text, or must-include points'
    },
    {
      id:'analyze', title:'Analyze', description:'Review information and surface patterns, gaps, or recommendations.',
      mode:'agent', expertSkill:'none', requestPlaceholder:'What do you want to understand?',
      contextPlaceholder:'Optional data, source text, links, or decision context'
    },
    {
      id:'run-task', title:'Run a task', description:'Ask BRAINY to complete a concrete piece of work.',
      mode:'agent', expertSkill:'none', requestPlaceholder:'What outcome do you need?',
      contextPlaceholder:'Optional files, constraints, destination, or deadline'
    }
  ];

  const LEGACY_LABELS = {
    audience:'Audience', channel:'Channel', keyMessage:'Key message', deliverable:'Deliverable', timing:'Timing',
    notes:'Context / constraints', eventType:'Format', owner:'Owners / stakeholders', tone:'Tone', approval:'Approvals',
    reviewFocus:'Review focus', draft:'Draft / work to review', taskType:'Task type', data:'Available evidence'
  };

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, max);
  }

  function findTemplate(id) {
    return DEFINITIONS.find(item => item.id === id) || null;
  }

  function templates() {
    return DEFINITIONS.map(item => ({
      id:item.id, title:item.title, description:item.description, mode:item.mode, expertSkill:item.expertSkill,
      fields:[
        {key:'request', label:'What do you need BRAINY to help with?', placeholder:item.requestPlaceholder, required:true, multiline:true},
        {key:'context', label:'Context', placeholder:item.contextPlaceholder, required:false, multiline:true}
      ]
    }));
  }

  function normalizeDraft(value) {
    const template = findTemplate(value && value.intent);
    const request = clean(value && value.request, MAX_REQUEST_CHARS);
    if (!template || !request) return null;
    return {
      id:clean(value.id, 100), intent:template.id, request,
      context:clean(value.context, MAX_CONTEXT_CHARS),
      createdAt:Number(value.createdAt) || 0, updatedAt:Number(value.updatedAt) || 0
    };
  }

  function prepare(intent, values) {
    const template = findTemplate(intent);
    if (!template) throw new Error('Unknown action');
    const request = clean(values && values.request, MAX_REQUEST_CHARS);
    if (!request) throw new Error('Tell BRAINY what you need');
    const context = clean(values && values.context, MAX_CONTEXT_CHARS);
    const rows = [`[BRAINY · ${template.title}]`, `What I need: ${request}`];
    if (context) rows.push(`Context: ${context}`);
    return { prompt:rows.join('\n'), expertSkill:template.expertSkill, mode:template.mode, intent:template.id };
  }

  function legacyIntent(templateId) {
    if (templateId === 'draft-communication' || templateId === 'create-content') return 'draft';
    if (templateId === 'review-work' || templateId === 'people-od-task') return 'analyze';
    if (templateId === 'plan-event') return 'run-task';
    return 'run-task';
  }

  function migrateLegacyDrafts(items) {
    return (Array.isArray(items) ? items : []).slice(0, 20).map((item) => {
      const values = item && item.values && typeof item.values === 'object' ? item.values : {};
      const request = clean(values.objective || values.keyMessage || values.draft || values.deliverable, MAX_REQUEST_CHARS);
      if (!request) return null;
      const context = Object.entries(values)
        .filter(([key,value]) => key !== 'objective' && value)
        .map(([key,value]) => `${LEGACY_LABELS[key] || key}: ${clean(value, 1600)}`)
        .join('\n');
      return {
        id:clean(item.id,100), intent:legacyIntent(item.templateId), request,
        context:clean(context,MAX_CONTEXT_CHARS), createdAt:Number(item.createdAt) || 0, updatedAt:Number(item.updatedAt) || 0
      };
    }).filter(Boolean);
  }

  function readLegacyDrafts(storage) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
      const items = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(items)) return [];
      return items.slice(0,20).map((item,index) => {
        const migrated = migrateLegacyDrafts([item])[0];
        return migrated ? {...migrated,legacyKey:String(item && item.id || `legacy-${index}`)} : null;
      }).filter(Boolean);
    } catch { return []; }
  }

  function removeLegacyDraft(storage, id) {
    if (!storage || typeof storage.getItem !== 'function') return false;
    try {
      const items = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(items)) return false;
      const needle = String(id == null ? '' : id);
      const remaining = items.filter((item,index) => String(item && item.id || `legacy-${index}`) !== needle);
      if (remaining.length === items.length) return false;
      if (remaining.length) storage.setItem(STORAGE_KEY,JSON.stringify(remaining));
      else storage.removeItem(STORAGE_KEY);
      return true;
    } catch { return false; }
  }

  function createSyncTracker() {
    let revision = 0;
    const activeMutations = new Set();
    let idleWaiters = [];
    return {
      beginLoad() { return revision; },
      beginMutation() {
        const token = Symbol('action-draft-mutation');
        activeMutations.add(token);
        revision += 1;
        return token;
      },
      endMutation(token) {
        if (!activeMutations.delete(token)) return revision;
        revision += 1;
        if (!activeMutations.size) {
          const waiters = idleWaiters;
          idleWaiters = [];
          waiters.forEach(resolve => resolve());
        }
        return revision;
      },
      needsReconcile(loadRevision) { return loadRevision !== revision; },
      waitForIdle() {
        if (!activeMutations.size) return Promise.resolve();
        return new Promise(resolve => idleWaiters.push(resolve));
      }
    };
  }

  async function waitForReconciliation(tracker,loadRevision,attempt=0,maxAttempts=1) {
    if (!tracker || attempt >= maxAttempts || !tracker.needsReconcile(loadRevision)) return false;
    await tracker.waitForIdle();
    return true;
  }

  return { STORAGE_KEY, templates, prepare, normalizeDraft, migrateLegacyDrafts, readLegacyDrafts, removeLegacyDraft, createSyncTracker, waitForReconciliation };
});
