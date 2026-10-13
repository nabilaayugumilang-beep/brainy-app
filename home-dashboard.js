(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrainyHomeDashboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function asDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function greeting(value, name='Ila') {
    const hour = asDate(value).getHours();
    const period = hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening');
    return `Good ${period}, ${String(name || 'Ila').trim() || 'Ila'}`;
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat('en-US', {
      weekday:'long', month:'long', day:'numeric'
    }).format(asDate(value));
  }

  function text(value,limit=240) {
    return String(value || '').replace(/\s+/g,' ').trim().slice(0,limit);
  }

  function normalizeMaterials(payload) {
    if (!payload || payload.ok !== true) throw new Error('Materials snapshot is invalid');
    const source = payload.collections && typeof payload.collections === 'object' ? payload.collections : {};
    const collection = (value,max,map) => {
      const item = value && typeof value === 'object' ? value : {};
      const rows = Array.isArray(item.items) ? item.items.slice(0,max).map(map).filter(row => row.title || row.source) : [];
      return {count:Math.max(0,Number(item.count) || rows.length),items:rows};
    };
    return {
      title:text(payload.title,100) || 'My Work HQ',
      status:text(payload.status,360),
      focus:(Array.isArray(payload.focus) ? payload.focus : []).slice(0,8).map(item => ({
        title:text(item?.title,120), detail:text(item?.detail,220), priority:text(item?.priority,12) || '—', checked:Boolean(item?.checked)
      })).filter(item => item.title).sort((a,b) => ({P1:1,P2:2,P3:3}[a.priority] || 9) - ({P1:1,P2:2,P3:3}[b.priority] || 9)),
      upcoming:(Array.isArray(payload.upcoming) ? payload.upcoming : []).slice(0,12).map(item => ({
        when:text(item?.when,60), event:text(item?.event,120), next:text(item?.next,100)
      })).filter(item => item.when || item.event),
      collections:{
        actions:collection(source.actions,5,item => ({title:text(item?.title,120),priority:text(item?.priority,12),state:text(item?.state,50),workstream:text(item?.workstream,80),nextAction:text(item?.nextAction,220),due:text(item?.due,40)})),
        decisions:collection(source.decisions,4,item => ({title:text(item?.title,120),status:text(item?.status,50),workstream:text(item?.workstream,80),nextMove:text(item?.nextMove,220),due:text(item?.due,40)})),
        sync:collection(source.sync,6,item => ({source:text(item?.source,80),state:text(item?.state,50),lastSync:text(item?.lastSync,50),frequency:text(item?.frequency,80),notes:text(item?.notes,220)})),
      },
      meta:{sourceUpdatedAt:text(payload.meta?.sourceUpdatedAt,50),refreshedAt:text(payload.meta?.refreshedAt,50),tokenCost:0},
    };
  }

  function recentDrafts(items, templates, limit=3) {
    const titles = new Map((Array.isArray(templates) ? templates : []).map(item => [item.id,item.title]));
    return (Array.isArray(items) ? items : [])
      .filter(item => item && item.id && item.intent && item.request)
      .slice()
      .sort((a,b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      .slice(0, limit)
      .map(item => ({
        id:String(item.id),
        intent:String(item.intent),
        title:String(titles.get(item.intent) || 'Action draft'),
        preview:String(item.request || 'Untitled draft'),
        updatedAt:Number(item.updatedAt) || 0
      }));
  }

  return { greeting, dateLabel, normalizeMaterials, recentDrafts };
});
