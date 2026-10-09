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

  function recentChats(items, limit=3) {
    return (Array.isArray(items) ? items : [])
      .filter(item => item && (item.key || item.id))
      .slice()
      .sort((a,b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      .slice(0, limit)
      .map(item => ({
        id:String(item.key || item.id),
        title:String(item.title || 'Untitled chat'),
        preview:String(item.preview || 'Continue conversation'),
        updatedAt:Number(item.updatedAt) || 0
      }));
  }

  function recentDrafts(items, templates, limit=3) {
    const titles = new Map((Array.isArray(templates) ? templates : []).map(item => [item.id,item.title]));
    return (Array.isArray(items) ? items : [])
      .filter(item => item && item.id && item.templateId)
      .slice()
      .sort((a,b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      .slice(0, limit)
      .map(item => ({
        id:String(item.id),
        templateId:String(item.templateId),
        title:String(titles.get(item.templateId) || 'Action draft'),
        preview:String(Object.values(item.values || {}).find(Boolean) || 'Untitled draft'),
        updatedAt:Number(item.updatedAt) || 0
      }));
  }

  return { greeting, dateLabel, recentChats, recentDrafts };
});
