(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrainyActionCenter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'brainy_action_drafts';
  const MAX_DRAFTS = 20;
  const MAX_VALUE_CHARS = 1600;
  const DEFINITIONS = [
    {
      id:'create-content', title:'Create Content', description:'Shape a channel-ready content brief.', expertSkill:'corporate-comms',
      fields:[
        ['objective','Objective','What should this content achieve?',true],
        ['audience','Audience','Who needs to see or act on it?',true],
        ['channel','Channel','LinkedIn, Instagram, internal, etc.'],
        ['keyMessage','Key message','The one thing people should remember',true],
        ['deliverable','Deliverable','Caption, carousel brief, video script, etc.'],
        ['timing','Timing','Deadline or publishing window'],
        ['notes','Context / constraints','Facts, references, tone, or must-avoid points',false,true]
      ]
    },
    {
      id:'plan-event', title:'Plan Event', description:'Turn an event idea into an execution brief.', expertSkill:'corporate-comms',
      fields:[
        ['objective','Objective','Why this event exists',true], ['audience','Audience','Who it is for',true],
        ['eventType','Format','Town hall, activation, media event, etc.'], ['timing','Date / timing','Target date and key milestones'],
        ['deliverable','Outputs','Experience, materials, coverage, follow-up'], ['owner','Owners / stakeholders','PICs, approvers, partners'],
        ['notes','Context / constraints','Budget, venue, risks, or dependencies',false,true]
      ]
    },
    {
      id:'draft-communication', title:'Draft Communication', description:'Prepare an internal or external communication.', expertSkill:'corporate-comms',
      fields:[
        ['objective','Objective','What must change after people read it?',true], ['audience','Audience','Internal or external recipients',true],
        ['channel','Channel','Email, memo, speech, announcement, etc.'], ['keyMessage','Key message','Core message and supporting facts',true],
        ['tone','Tone','Direct, warm, formal, reassuring, etc.'], ['approval','Approvals','Required reviewer or sign-off'],
        ['notes','Context / constraints','Sensitive points, references, or deadline',false,true]
      ]
    },
    {
      id:'review-work', title:'Review Work', description:'Run a focused review before approval.', expertSkill:'corporate-comms',
      fields:[
        ['objective','Purpose','What the work is meant to achieve',true], ['audience','Audience','Who will receive it'],
        ['reviewFocus','Review focus','Clarity, strategy, tone, risk, accuracy, etc.',true],
        ['draft','Draft / work to review','Paste the draft or describe the artifact',true,true],
        ['notes','Context / constraints','Brief, references, known concerns',false,true]
      ]
    },
    {
      id:'people-od-task', title:'People & OD Task', description:'Frame a People & OD task with the right evidence.', expertSkill:'people-od',
      fields:[
        ['objective','Objective','Decision or outcome needed',true], ['taskType','Task type','WLA, FTE, JD, talent, appraisal, org design, etc.',true],
        ['data','Available evidence','Data, documents, observations, or constraints',false,true],
        ['deliverable','Deliverable','Analysis, recommendation, workbook, draft, etc.'],
        ['notes','Context / constraints','Stakeholders, timing, privacy, or assumptions',false,true]
      ]
    }
  ];

  function clean(value) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, MAX_VALUE_CHARS);
  }

  function findTemplate(id) {
    return DEFINITIONS.find(item => item.id === id) || null;
  }

  function templates() {
    return DEFINITIONS.map(item => ({
      id:item.id, title:item.title, description:item.description, expertSkill:item.expertSkill,
      fields:item.fields.map(([key,label,placeholder,required,multiline]) => ({key,label,placeholder,required:!!required,multiline:!!multiline}))
    }));
  }

  function sanitizeValues(template, values) {
    const cleanValues = {};
    template.fields.forEach(([key]) => {
      const value = clean(values && values[key]);
      if (value) cleanValues[key] = value;
    });
    return cleanValues;
  }

  function loadDrafts(storage) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && findTemplate(item.templateId) && typeof item.id === 'string')
        .slice(0, MAX_DRAFTS)
        .map(item => ({
          id:item.id, templateId:item.templateId,
          values:sanitizeValues(findTemplate(item.templateId), item.values),
          createdAt:Number(item.createdAt) || 0, updatedAt:Number(item.updatedAt) || 0
        }));
    } catch { return []; }
  }

  function writeDrafts(storage, drafts) {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Draft storage unavailable');
    storage.setItem(STORAGE_KEY, JSON.stringify(drafts.slice(0, MAX_DRAFTS)));
  }

  function saveDraft(storage, draft, now=Date.now()) {
    const template = findTemplate(draft && draft.templateId);
    if (!template) throw new Error('Unknown action');
    const drafts = loadDrafts(storage);
    const existing = draft.id ? drafts.find(item => item.id === draft.id) : null;
    const saved = {
      id:existing ? existing.id : `action-${now}`,
      templateId:template.id,
      values:sanitizeValues(template, draft.values),
      createdAt:existing ? existing.createdAt : now,
      updatedAt:now
    };
    const next = [saved, ...drafts.filter(item => item.id !== saved.id)].slice(0, MAX_DRAFTS);
    writeDrafts(storage, next);
    return saved;
  }

  function removeDraft(storage, id) {
    const next = loadDrafts(storage).filter(item => item.id !== id);
    writeDrafts(storage, next);
    return next;
  }

  function prepare(templateId, values) {
    const template = findTemplate(templateId);
    if (!template) throw new Error('Unknown action');
    const rows = [`[Action Center · ${template.title}]`];
    template.fields.forEach(([key,label]) => {
      const value = clean(values && values[key]);
      if (value) rows.push(`${label}: ${value}`);
    });
    return { prompt:rows.join('\n'), expertSkill:template.expertSkill, templateId:template.id };
  }

  return { STORAGE_KEY, MAX_DRAFTS, templates, prepare, loadDrafts, saveDraft, removeDraft };
});
