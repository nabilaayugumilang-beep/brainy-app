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

  function notionUrl(value) {
    try {
      const raw = String(value || '').trim();
      const authority = raw.match(/^https:\/\/([^/?#]*)(?:[/?#]|$)/i)?.[1] || '';
      if (!raw || raw.length > 2048 || raw.includes('#') || !authority || authority.includes('@') || authority.includes(':')) return '';
      const url = new URL(raw);
      const safe = url.protocol === 'https:'
        && /(^|\.)notion\.so$|(^|\.)notion\.com$/.test(url.hostname)
        && !url.username && !url.password && !url.port && !url.hash;
      const normalized = safe ? url.toString() : '';
      return normalized.length <= 2048 ? normalized : '';
    } catch { return ''; }
  }

  function createLatestRequestGate() {
    let generation = 0;
    return {
      start() { generation += 1; return generation; },
      invalidate() { generation += 1; },
      isCurrent(token) { return token === generation; },
    };
  }

  function newsletterStatus(state,error,hasSnapshot,hasLatest,archiveLength=0) {
    if (state === 'error') {
      const message = text(error,360) || 'Newsletter could not be refreshed.';
      return hasSnapshot ? `${message} · Showing the last successful issue.` : message;
    }
    return hasLatest
      ? `Latest published issue · ${Math.max(0,Number(archiveLength) || 0)} issues available in Notion`
      : 'No published Newsletter issue is available yet.';
  }

  function normalizeNewsletter(payload) {
    if (!payload || payload.ok !== true) throw new Error('Newsletter snapshot is invalid');
    const strings = (value,max=3,limit=900) => (Array.isArray(value) ? value : []).slice(0,max).map(item => text(item,limit)).filter(Boolean);
    const rawLatest = payload.latest && typeof payload.latest === 'object' ? payload.latest : null;
    const latest = rawLatest ? {
      id:text(rawLatest.id,80), title:text(rawLatest.title,180), editedAt:text(rawLatest.editedAt,50), url:notionUrl(rawLatest.url),
      book:text(rawLatest.book,180), why:strings(rawLatest.why,3), idea:text(rawLatest.idea,1200),
      meaning:strings(rawLatest.meaning,3), example:strings(rawLatest.example,2),
      tryThis:{intro:text(rawLatest.tryThis?.intro,900),steps:strings(rawLatest.tryThis?.steps,6,500)},
      remember:text(rawLatest.remember,900), sources:strings(rawLatest.sources,4,300),
    } : null;
    return {
      title:text(payload.title,100) || 'One Book, One Idea Worth Stealing',
      cadence:text(payload.cadence,120) || 'A fresh idea every Thursday · from Notion',
      latest:latest && latest.id && latest.title ? latest : null,
      archive:(Array.isArray(payload.archive) ? payload.archive : []).slice(0,6).map(item => ({
        id:text(item?.id,80),title:text(item?.title,180),editedAt:text(item?.editedAt,50),url:notionUrl(item?.url)
      })).filter(item => item.id && item.title),
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

  function normalizeTeamGtd(value) {
    const source = value && typeof value === 'object' ? value : {};
    const peopleByName = new Map(['Tasa','Disha','Intan'].map(name => [name,{name,updatedAt:'',items:[]}]))
    for (const rawPerson of Array.isArray(source.people) ? source.people.slice(0,8) : []) {
      const rawName = text(rawPerson?.name,80).toLowerCase();
      const name = rawName.includes('tasa') ? 'Tasa'
        : (rawName.includes('disha') || rawName.includes('dinisha')) ? 'Disha'
        : rawName.includes('intan') ? 'Intan' : '';
      if (!name) continue;
      const person = peopleByName.get(name);
      const updatedAt = text(rawPerson?.updatedAt,50);
      if (updatedAt > person.updatedAt) person.updatedAt = updatedAt;
      for (const rawItem of Array.isArray(rawPerson?.items) ? rawPerson.items.slice(0,180) : []) {
        const id = text(rawItem?.id,80);
        const title = text(rawItem?.title,360);
        const section = ['active','waiting','completed'].includes(rawItem?.section) ? rawItem.section : '';
        if (!id || !title || !section || person.items.some(item => item.id === id)) continue;
        person.items.push({
          id,title,section,
          priority:['P1','P2','P3'].includes(rawItem?.priority) ? rawItem.priority : '',
          checked:Boolean(rawItem?.checked),
          reviewed:Boolean(rawItem?.reviewed),
          canComplete:Boolean(rawItem?.canComplete),
        });
      }
    }
    const people = [...peopleByName.values()].map(person => ({
      ...person,
      counts:{
        active:person.items.filter(item => item.section === 'active').length,
        waiting:person.items.filter(item => item.section === 'waiting').length,
        completed:person.items.filter(item => item.section === 'completed').length,
        reviewed:person.items.filter(item => item.reviewed && item.section !== 'completed').length,
      },
    }));
    return {
      ok:source.ok === true,
      people,
      meta:{
        refreshedAt:text(source.meta?.refreshedAt,50),
        tokenCost:source.meta?.tokenCost === 0 ? 0 : null,
        source:text(source.meta?.source,80),
      },
    };
  }

  function filterTeamItems(person,filter) {
    const section = ['active','waiting','completed'].includes(filter) ? filter : 'active';
    return (Array.isArray(person?.items) ? person.items : []).filter(item => item.section === section);
  }

  function shouldOpenTeamCard({wasOpen=false,hadCards=false,index=0,isMobile=false}={}) {
    return Boolean(wasOpen || (!hadCards && index === 0 && !isMobile));
  }

  function safeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0,Math.min(9999,Math.trunc(number))) : 0;
  }

  function normalizeWorkItem(raw,kind) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const item = {
      id:text(source.id,80),
      title:text(source.title || source.source,360),
      url:notionUrl(source.url),
      status:text(source.status || source.state,80),
      priority:text(source.priority,40),
      owner:text(source.owner,100),
      workstream:text(source.workstream,100),
      due:text(source.due,50),
    };
    if (kind === 'focus') item.overdue = Boolean(source.overdue);
    if (kind === 'decision') item.nextMove = text(source.nextMove,600);
    if (kind === 'action') {
      item.state = text(source.state,80);
      item.confidence = text(source.confidence,80);
      item.nextAction = text(source.nextAction,600);
    }
    if (kind === 'sync') {
      item.source = text(source.source,180);
      item.state = text(source.state,80);
      item.health = ['error','stale','manual','healthy'].includes(source.health) ? source.health : 'unknown';
      item.lastSync = text(source.lastSync,50);
      item.notes = text(source.notes,600);
    }
    return item;
  }

  function normalizeWorkSummary(payload) {
    if (!payload || payload.ok !== true) throw new Error('Work summary snapshot is invalid');
    const items = (section,kind,max=5) => (Array.isArray(section?.items) ? section.items : [])
      .slice(0,max).map(raw => normalizeWorkItem(raw,kind)).filter(item => item.id && item.title);
    return {
      focus:{
        counts:{
          open:safeCount(payload.focus?.counts?.open),
          overdue:safeCount(payload.focus?.counts?.overdue),
          dueSoon:safeCount(payload.focus?.counts?.dueSoon),
          highPriority:safeCount(payload.focus?.counts?.highPriority),
        },
        items:items(payload.focus,'focus'),
      },
      decisions:{count:safeCount(payload.decisions?.count),items:items(payload.decisions,'decision')},
      actions:{count:safeCount(payload.actions?.count),items:items(payload.actions,'action')},
      sync:{count:safeCount(payload.sync?.count),items:items(payload.sync,'sync',8)},
      meta:{
        source:text(payload.meta?.source,100) || 'Notion Work Command Center',
        sourceUpdatedAt:text(payload.meta?.sourceUpdatedAt,50),
        refreshedAt:text(payload.meta?.refreshedAt,50),
        tokenCost:0,
      },
    };
  }

  function workSummaryStatus(state,error,hasSnapshot) {
    if (state === 'error') {
      const message = text(error,360) || 'Work summary could not be refreshed.';
      return hasSnapshot ? `${message} · Showing the last successful snapshot.` : message;
    }
    if (state === 'loading' && !hasSnapshot) return 'Loading bounded Notion work sources…';
    return hasSnapshot ? 'Notion · bounded work sources · 0 AI tokens' : 'Waiting for sync';
  }

  return { greeting, dateLabel, normalizeNewsletter, createLatestRequestGate, newsletterStatus, recentDrafts, normalizeTeamGtd, filterTeamItems, shouldOpenTeamCard, normalizeWorkSummary, workSummaryStatus };
});
