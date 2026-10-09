(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrainyLocalTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'brainy_local_tools_v1';
  const TYPES = ['tasks','notes','templates','clips','decisions','pins'];
  const LIMITS = {tasks:120,notes:80,templates:50,clips:30,decisions:80,pins:30};
  const STATUS = ['backlog','today','doing','done'];
  const PRIORITY = ['low','medium','high'];
  const clean = (value,max=2000) => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const cleanMultiline = (value,max=6000) => String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
  const blank = () => ({version:1,tasks:[],notes:[],templates:[],clips:[],decisions:[],pins:[],preferences:{privateMode:false,widgets:{pins:true,insights:true},focusMinutes:25},focus:{running:false,endsAt:0,label:'Focus'}});
  function normalize(input) {
    const base=blank(), source=input && typeof input==='object' ? input : {};
    TYPES.forEach(type => { base[type]=Array.isArray(source[type]) ? source[type].filter(Boolean).slice(0,LIMITS[type]) : []; });
    if (source.preferences && typeof source.preferences==='object') {
      base.preferences.privateMode=!!source.preferences.privateMode;
      base.preferences.focusMinutes=Math.min(120,Math.max(1,Number(source.preferences.focusMinutes)||25));
      base.preferences.widgets={...base.preferences.widgets,...source.preferences.widgets};
    }
    if (source.focus && typeof source.focus==='object') base.focus={running:!!source.focus.running,endsAt:Number(source.focus.endsAt)||0,label:clean(source.focus.label,80)||'Focus'};
    return base;
  }
  function load(storage) { try { return normalize(JSON.parse(storage.getItem(STORAGE_KEY)||'null')); } catch { return blank(); } }
  function save(storage,state) { const next=normalize(state); storage.setItem(STORAGE_KEY,JSON.stringify(next)); return next; }
  function record(type,item,now) {
    const id=clean(item.id,100)||`${type}-${now}`;
    const common={id,createdAt:Number(item.createdAt)||now,updatedAt:now};
    if (type==='tasks') return {...common,title:clean(item.title,180),status:STATUS.includes(item.status)?item.status:'backlog',priority:PRIORITY.includes(item.priority)?item.priority:'medium',due:/^\d{4}-\d{2}-\d{2}$/.test(item.due||'')?item.due:'',projectId:clean(item.projectId,100),checklist:(Array.isArray(item.checklist)?item.checklist:[]).map(entry=>typeof entry==='string'?{text:clean(entry,180),done:false}:{text:clean(entry&&entry.text,180),done:!!(entry&&entry.done)}).filter(entry=>entry.text).slice(0,20)};
    if (type==='notes') return {...common,title:clean(item.title,180)||'Untitled note',body:cleanMultiline(item.body)};
    if (type==='templates') return {...common,title:clean(item.title,180)||'Untitled template',body:cleanMultiline(item.body)};
    if (type==='clips') return {...common,text:cleanMultiline(item.text,4000),pinned:!!item.pinned};
    if (type==='decisions') return {...common,title:clean(item.title,180),reason:cleanMultiline(item.reason,3000),owner:clean(item.owner,120),followUp:cleanMultiline(item.followUp,1000),due:/^\d{4}-\d{2}-\d{2}$/.test(item.due||'')?item.due:''};
    return {...common,entityType:TYPES.includes(item.entityType)?item.entityType:'notes',entityId:clean(item.entityId,100),title:clean(item.title,180)||'Pinned item'};
  }
  function upsert(storage,type,item,now=Date.now()) {
    if (!TYPES.includes(type)) throw new Error('Unsupported local collection');
    const state=load(storage), next=record(type,item||{},now);
    if ((type==='tasks'||type==='decisions') && !next.title) throw new Error('Title is required');
    if ((type==='clips') && !next.text) throw new Error('Text is required');
    const index=state[type].findIndex(entry => entry.id===next.id);
    if (index>=0) next.createdAt=Number(state[type][index].createdAt)||next.createdAt;
    state[type]=[next,...state[type].filter(entry => entry.id!==next.id)].slice(0,LIMITS[type]);
    save(storage,state); return next;
  }
  function remove(storage,type,id) { if (!TYPES.includes(type)) return load(storage); const state=load(storage); state[type]=state[type].filter(item=>item.id!==id); if(type!=='pins') state.pins=state.pins.filter(pin=>!(pin.entityType===type&&pin.entityId===id)); return save(storage,state); }
  function moveTask(storage,id,status,now=Date.now()) { const state=load(storage), item=state.tasks.find(task=>task.id===id); if(!item) throw new Error('Task not found'); return upsert(storage,'tasks',{...item,status:STATUS.includes(status)?status:item.status},now); }
  function toggleChecklist(storage,id,index,now=Date.now()) { const state=load(storage), item=state.tasks.find(task=>task.id===id); if(!item) throw new Error('Task not found'); const checklist=(item.checklist||[]).map((entry,i)=>i===index?{...entry,done:!entry.done}:entry); return upsert(storage,'tasks',{...item,checklist},now); }
  function search(state,query,limit=30) {
    const terms=clean(query,200).toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const source=normalize(state), results=[];
    TYPES.forEach(type => source[type].forEach(item => {
      const haystack=Object.entries(item).filter(([key])=>!['createdAt','updatedAt'].includes(key)).map(([,value])=>String(value||'')).join(' ').toLowerCase();
      if (!terms.every(term=>haystack.includes(term))) return;
      const title=item.title||item.text||item.body||'Pinned item';
      const preview=item.body||item.reason||item.followUp||item.text||item.status||'';
      results.push({type,id:item.id,title:clean(title,180),preview:clean(preview,240),updatedAt:Number(item.updatedAt)||0});
    }));
    return results.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,Math.max(1,Math.min(100,limit)));
  }
  function dateKey(value) { const d=value instanceof Date?value:new Date(value); const year=d.getFullYear(), month=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${year}-${month}-${day}`; }
  function sortTasks(tasks,now=new Date()) {
    const todayKey=dateKey(now), rank={high:0,medium:1,low:2};
    const dueBucket=task=>!task.due?3:(task.due<todayKey?0:(task.due===todayKey?1:2));
    return [...(tasks||[])].sort((a,b)=>dueBucket(a)-dueBucket(b)||(rank[a.priority]??1)-(rank[b.priority]??1)||String(a.due||'9999').localeCompare(String(b.due||'9999'))||(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));
  }
  function completionStreak(tasks,now) {
    const days=new Set(tasks.filter(task=>task.status==='done').map(task=>dateKey(Number(task.updatedAt)||0)));
    let cursor=new Date(now), streak=0;
    if(!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate()-1);
    while(days.has(dateKey(cursor))){streak+=1;cursor.setDate(cursor.getDate()-1);}
    return streak;
  }
  function insights(state,now=new Date()) {
    const tasks=normalize(state).tasks, todayKey=dateKey(now), done=tasks.filter(task=>task.status==='done').length;
    return {total:tasks.length,done,today:tasks.filter(task=>task.status!=='done'&&(task.status==='today'||task.due===todayKey)).length,overdue:tasks.filter(task=>task.status!=='done'&&task.due&&task.due<todayKey).length,completionRate:tasks.length?Math.round(done/tasks.length*100):0,streak:completionStreak(tasks,now)};
  }
  function applyTemplate(body,values={}) { return cleanMultiline(body).replace(/\{([a-zA-Z][\w-]*)\}/g,(match,key)=>Object.prototype.hasOwnProperty.call(values,key)?clean(values[key],1000):match); }
  function setPreferences(storage,patch={}) { const state=load(storage); if('privateMode' in patch) state.preferences.privateMode=!!patch.privateMode; if('focusMinutes' in patch) state.preferences.focusMinutes=Math.min(120,Math.max(1,Number(patch.focusMinutes)||25)); if(patch.widgets&&typeof patch.widgets==='object') state.preferences.widgets={...state.preferences.widgets,...patch.widgets}; return save(storage,state).preferences; }
  function startFocus(storage,minutes,label='Focus',now=Date.now()) { const state=load(storage), duration=Math.min(120,Math.max(1,Number(minutes)||state.preferences.focusMinutes)); state.focus={running:true,endsAt:now+duration*60000,label:clean(label,80)||'Focus'}; save(storage,state); return state.focus; }
  function stopFocus(storage) { const state=load(storage); state.focus={...state.focus,running:false,endsAt:0}; save(storage,state); return state.focus; }
  function focusRemaining(state,now=Date.now()) { const focus=normalize(state).focus; return focus.running?Math.max(0,Math.ceil((focus.endsAt-now)/1000)):0; }
  return {STORAGE_KEY,TYPES,STATUS,PRIORITY,blank,load,save,upsert,remove,moveTask,toggleChecklist,search,sortTasks,insights,applyTemplate,dateKey,setPreferences,startFocus,stopFocus,focusRemaining};
});
