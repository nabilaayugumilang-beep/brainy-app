(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExpertSkills = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'brainy_expert_skill';
  const NONE = 'none';
  const PEOPLE_OD = 'people-od';
  const CORPORATE_COMMS = 'corporate-comms';
  const PACKS = Object.freeze([
    { id: NONE, label: 'Expert: Off' },
    { id: PEOPLE_OD, label: 'People & OD Expert' },
    { id: CORPORATE_COMMS, label: 'Corporate Communications Expert' }
  ]);
  const PEOPLE_OD_GUIDANCE = [
    'Expert skill: People & OD.',
    'Use evidence-based, decision-ready reasoning.',
    'Separate evidence, assumptions, gaps, and recommendations.',
    'For WLA/FTE, use concrete tasks. FTE is capacity, not productivity; assess output, quality/SLA, rework, time mix, data readiness, and context.',
    'State objective and method, challenge blind spots, note risks, and self-review.',
    'Protect privacy, flag fairness, and do not make final employment or legal decisions.',
    'Ask only for blocking inputs. Stay concise.'
  ].join(' ');
  const CORPORATE_COMMS_GUIDANCE = [
    'Corporate Communications expert.',
    'Audience-first/channel-fit/brand-consistent.',
    'Set objective/audience/message; separate evidence/assumptions/gaps; recommend CTA, owner, timing, success measures.',
    'Scope: internal/external comms, PR/media relations, social/editorial, campaigns/events, executive comms, creative governance, stakeholder engagement, reputation, crisis/issues.',
    'Never invent company claims; use approved refs or flag gaps.',
    'Check tone, accessibility, privacy/consent, risk, approvals, measurement.',
    'Review brief.'
  ].join(' ');
  const SUBSTANTIVE = /analys|assess|review|evaluat|recommend|plan|design|workforce|workload|\bwla\b|\bfte\b|talent|performance|appraisal|organi[sz]ation|org structure|job description|\bjd\b|capacity|productivity|promotion|succession|competenc|employee relations|learning|training|headcount|manpower|hiring|people|\bhr\b|corporate comm|\bcomms\b|communication|social media|socmed|campaign|content|caption|editorial|press release|media relations|town hall|event|creative|engagement|stakeholder|reputation|crisis|issues management|brand/i;

  function normalize(value) {
    return value === PEOPLE_OD || value === CORPORATE_COMMS ? value : NONE;
  }

  function label(value) {
    const skill = normalize(value);
    if (skill === NONE) return '';
    const pack = PACKS.find(item => item.id === skill);
    return pack ? pack.label : '';
  }

  function load(storage) {
    try { return normalize(storage && storage.getItem(STORAGE_KEY)); }
    catch { return NONE; }
  }

  function save(storage, value) {
    const next = normalize(value);
    try { if (storage) storage.setItem(STORAGE_KEY, next); } catch { /* non-fatal */ }
    return next;
  }

  function isSubstantive(text) {
    const request = String(text || '').trim();
    return request.length >= 100 || SUBSTANTIVE.test(request);
  }

  function guidance(value, text) {
    if (!isSubstantive(text)) return '';
    const skill = normalize(value);
    if (skill === PEOPLE_OD) return PEOPLE_OD_GUIDANCE;
    if (skill === CORPORATE_COMMS) return CORPORATE_COMMS_GUIDANCE;
    return '';
  }

  return Object.freeze({ STORAGE_KEY, PACKS, normalize, label, load, save, isSubstantive, guidance });
});
