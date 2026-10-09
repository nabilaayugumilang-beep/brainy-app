(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExpertSkills = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'brainy_expert_skill';
  const NONE = 'none';
  const PEOPLE_OD = 'people-od';
  const PACKS = Object.freeze([
    { id: NONE, label: 'Expert: Off' },
    { id: PEOPLE_OD, label: 'People & OD Expert' }
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
  const SUBSTANTIVE = /analys|assess|review|evaluat|recommend|plan|design|workforce|workload|\bwla\b|\bfte\b|talent|performance|appraisal|organi[sz]ation|org structure|job description|\bjd\b|capacity|productivity|promotion|succession|competenc|employee relations|learning|training|headcount|manpower|hiring|people|\bhr\b/i;

  function normalize(value) {
    return value === PEOPLE_OD ? PEOPLE_OD : NONE;
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
    return normalize(value) === PEOPLE_OD && isSubstantive(text) ? PEOPLE_OD_GUIDANCE : '';
  }

  return Object.freeze({ STORAGE_KEY, PACKS, normalize, load, save, isSubstantive, guidance });
});
