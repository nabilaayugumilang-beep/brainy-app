(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrainyLocalToolsController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PANEL_FOR = {tasks:'tasks',notes:'notes',templates:'templates',clips:'clips',decisions:'decisions',pins:'tasks'};
  function create(options={}) {
    const root=options.root, storage=options.storage, toast=options.showToast||(()=>{}), confirmFn=options.confirm||(()=>true), useText=options.onUseText||(()=>{});
    let activePanel='tasks', focusFinished=false, scratchTimer=0;
    const SCRATCH_KEY='brainy_note_scratch_v1', REMINDER_KEY='brainy_local_reminder_v1';
    const $=(selector)=>root.querySelector(selector);
    const state=()=>BrainyLocalTools.load(storage);
    const privateCopy=(type,localState)=>localState.preferences.privateMode&&['notes','clips'].includes(type)?' private-copy':'';
    function node(tag,className,text) { const el=document.createElement(tag); if(className) el.className=className; if(text!==undefined) el.textContent=text; return el; }
    function mini(label,onClick,className='') { const button=node('button',`local-mini ${className}`.trim(),label); button.type='button'; button.addEventListener('click',onClick); return button; }
    function empty(target,text) { target.append(node('p','local-empty',text)); }
    function pin(type,item) {
      BrainyLocalTools.upsert(storage,'pins',{id:`pin-${type}-${item.id}`,entityType:type,entityId:item.id,title:item.title||item.text||'Pinned item'});
      render(); toast('Pinned locally');
    }
    function remove(type,id) {
      if (!confirmFn('Delete this local item?')) return;
      BrainyLocalTools.remove(storage,type,id); render(); toast('Deleted locally');
    }
    function actions(type,item,bodyText='') {
      const row=node('div','local-card-actions');
      row.append(mini('Pin',()=>pin(type,item)));
      if (bodyText) row.append(mini('Use',()=>useText(bodyText)));
      row.append(mini('Delete',()=>remove(type,item.id),'danger'));
      return row;
    }
    function renderInsights(localState) {
      const target=$('#localInsights'); target.replaceChildren();
      const info=BrainyLocalTools.insights(localState,new Date());
      [['Tasks',info.total],['Today',info.today],['Overdue',info.overdue],['Done',info.done],['Streak',`${info.streak}d`],['Complete',`${info.completionRate}%`]].forEach(([label,value])=>{
        const card=node('div','local-stat'); card.append(node('strong','',String(value)),node('span','',label)); target.append(card);
      });
    }
    function renderPins(localState,target=$('#localPins'),home=false) {
      target.replaceChildren();
      if (!localState.pins.length) { empty(target,home?'Pin important local items to see them here.':'Use Pin on any local item to add a shortcut.'); return; }
      localState.pins.slice(0,home?3:30).forEach(pinItem=>{
        const button=node('button','home-item'); button.type='button';
        button.append(node('strong','',pinItem.title),node('span','',pinItem.entityType));
        button.addEventListener('click',()=>options.onOpenPanel?.(PANEL_FOR[pinItem.entityType]||'tasks'));
        if (!home) button.addEventListener('contextmenu',event=>{event.preventDefault(); BrainyLocalTools.remove(storage,'pins',pinItem.id); render();});
        target.append(button);
      });
    }
    function renderTasks(localState) {
      BrainyLocalTools.STATUS.forEach(status=>{
        const target=$(`#board-${status}`); target.replaceChildren();
        const items=BrainyLocalTools.sortTasks(localState.tasks.filter(item=>item.status===status));
        if (!items.length) empty(target,'Drop tasks here');
        items.forEach(item=>{
          const card=node('article','local-card'); card.draggable=true; card.dataset.taskId=item.id;
          card.addEventListener('dragstart',event=>event.dataTransfer.setData('text/plain',item.id));
          const top=node('div','local-card-top'); top.append(node('strong','',item.title),node('span','local-meta',item.priority)); card.append(top);
          const meta=[item.projectId?`Project ${item.projectId}`:'',item.due?`Due ${item.due}`:'',item.checklist?.length?`${item.checklist.filter(entry=>entry.done).length}/${item.checklist.length} checks`:''].filter(Boolean).join(' · ');
          if(meta) card.append(node('div','local-meta',meta));
          (item.checklist||[]).forEach((entry,index)=>{
            const label=node('label','local-check'); const box=document.createElement('input'); box.type='checkbox'; box.checked=entry.done;
            box.addEventListener('change',()=>{BrainyLocalTools.toggleChecklist(storage,item.id,index);render();}); label.append(box,node('span','',entry.text)); card.append(label);
          });
          const row=node('div','local-card-actions');
          const select=node('select','local-mini'); BrainyLocalTools.STATUS.forEach(value=>{const option=node('option','',value);option.value=value;option.selected=value===item.status;select.append(option);});
          select.setAttribute('aria-label','Move task'); select.addEventListener('change',()=>{BrainyLocalTools.moveTask(storage,item.id,select.value);render();});
          row.append(select,mini('Pin',()=>pin('tasks',item)),mini('Delete',()=>remove('tasks',item.id),'danger')); card.append(row); target.append(card);
        });
      });
    }
    function renderNotes(localState) {
      const target=$('#noteList'); target.replaceChildren(); if(!localState.notes.length) empty(target,'Your private notes will appear here.');
      localState.notes.forEach(item=>{const card=node('article','local-card');card.append(node('strong','',item.title),node('p',privateCopy('notes',localState),item.body),actions('notes',item,item.body));target.append(card);});
    }
    function renderTemplates(localState) {
      const target=$('#templateList'); target.replaceChildren(); if(!localState.templates.length) empty(target,'Reusable templates will appear here.');
      localState.templates.forEach(item=>{
        const card=node('article','local-card'); card.append(node('strong','',item.title),node('p','',item.body));
        const row=actions('templates',item);
        row.insertBefore(mini('Use template',()=>{
          const values={}; const keys=[...new Set([...item.body.matchAll(/\{([a-zA-Z][\w-]*)\}/g)].map(match=>match[1]))];
          keys.forEach(key=>{const value=window.prompt(`Value for ${key}`,'');if(value!==null)values[key]=value;});
          useText(BrainyLocalTools.applyTemplate(item.body,values));
        }),row.firstChild); card.append(row); target.append(card);
      });
    }
    function renderClips(localState) {
      const target=$('#clipList'); target.replaceChildren(); if(!localState.clips.length) empty(target,'Saved clipboard snippets will appear here.');
      localState.clips.forEach(item=>{const card=node('article','local-card');card.append(node('p',privateCopy('clips',localState),item.text));const row=actions('clips',item,item.text);row.insertBefore(mini('Copy',async()=>{try{await navigator.clipboard.writeText(item.text);toast('Copied');}catch{toast('Copy was blocked by the browser');}}),row.firstChild);card.append(row);target.append(card);});
    }
    function renderDecisions(localState) {
      const target=$('#decisionList'); target.replaceChildren(); if(!localState.decisions.length) empty(target,'Decisions and their reasoning will appear here.');
      localState.decisions.forEach(item=>{const card=node('article','local-card');const detail=[item.owner&&`Owner: ${item.owner}`,item.due&&`Due: ${item.due}`].filter(Boolean).join(' · ');card.append(node('strong','',item.title));if(detail)card.append(node('div','local-meta',detail));if(item.reason)card.append(node('p','',item.reason));if(item.followUp)card.append(node('p','',`Follow-up: ${item.followUp}`));card.append(actions('decisions',item,[item.title,item.reason,item.followUp].filter(Boolean).join('\n')));target.append(card);});
    }
    function renderSearch(localState) {
      const target=$('#localSearchResults'), query=$('#localSearch').value; target.replaceChildren();
      const results=BrainyLocalTools.search(localState,query);
      if(!query.trim()) return;
      if(!results.length){empty(target,'No local matches.');return;}
      results.slice(0,12).forEach(result=>{const button=node('button','home-item');button.type='button';button.append(node('strong','',result.title),node('span',privateCopy(result.type,localState),`${result.type} · ${result.preview}`));button.addEventListener('click',()=>show(PANEL_FOR[result.type]||'tasks'));target.append(button);});
    }
    function renderFocus(localState) {
      const remaining=BrainyLocalTools.focusRemaining(localState); const minutes=Math.floor(remaining/60),seconds=remaining%60;
      $('#focusClock').textContent=`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
      $('#focusLabel').textContent=localState.focus.running?localState.focus.label:'Ready to focus';
      $('#focusStop').hidden=!localState.focus.running;
      if(localState.focus.running&&remaining===0&&!focusFinished){focusFinished=true;BrainyLocalTools.stopFocus(storage);toast('Focus session complete');if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('Focus complete',{body:localState.focus.label});render();}
      if(localState.focus.running&&remaining>0) focusFinished=false;
    }
    function renderSettings(localState) {
      $('#privateModeToggle').checked=localState.preferences.privateMode;
      $('#pinsWidgetToggle').checked=localState.preferences.widgets.pins!==false;
      $('#insightsWidgetToggle').checked=localState.preferences.widgets.insights!==false;
      $('#focusForm').elements.minutes.value=localState.preferences.focusMinutes;
      $('#enableReminders').textContent=typeof Notification!=='undefined'&&Notification.permission==='granted'?'Reminders enabled':'Enable browser reminders';
    }
    function render() {
      const localState=state();
      root.querySelectorAll('[data-local-panel]').forEach(button=>button.classList.toggle('active',button.dataset.localPanel===activePanel));
      root.querySelectorAll('[data-local-view]').forEach(panel=>panel.hidden=panel.dataset.localView!==activePanel);
      renderInsights(localState);renderPins(localState);renderTasks(localState);renderNotes(localState);renderTemplates(localState);renderClips(localState);renderDecisions(localState);renderFocus(localState);renderSettings(localState);renderSearch(localState);
    }
    function show(panel='tasks') { activePanel=PANEL_FOR[panel]||panel||'tasks'; render(); }
    function focusSearch() { $('#localSearch').focus(); $('#localSearch').select(); }
    function renderHome(pulseTarget,pinsTarget) {
      const localState=state(),info=BrainyLocalTools.insights(localState,new Date());
      pulseTarget.parentElement.hidden=localState.preferences.widgets.insights===false; pinsTarget.parentElement.hidden=localState.preferences.widgets.pins===false;
      pulseTarget.replaceChildren();
      [['Today',`${info.today} active task${info.today===1?'':'s'}`,'tasks'],['Overdue',`${info.overdue} need attention`,'tasks'],['Focus',localState.focus.running?localState.focus.label:'Start a focus session','focus']].forEach(([title,copy,panel])=>{const button=node('button','home-item');button.type='button';button.append(node('strong','',title),node('span','',copy));button.addEventListener('click',()=>options.onOpenPanel?.(panel));pulseTarget.append(button);});
      renderPins(localState,pinsTarget,true);
    }
    function notifyDueTasks() {
      if(typeof Notification==='undefined'||Notification.permission!=='granted') return;
      const localState=state(), info=BrainyLocalTools.insights(localState,new Date());
      if(!info.today&&!info.overdue) return;
      const signature=`${BrainyLocalTools.dateKey(new Date())}:${info.today}:${info.overdue}`;
      if(storage.getItem(REMINDER_KEY)===signature) return;
      try {
        new Notification('BRAINY Today',{body:`${info.today} today · ${info.overdue} overdue`});
        storage.setItem(REMINDER_KEY,signature);
      } catch {}
    }
    function bindForm(id,type,reader) {
      $(id).addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());try{BrainyLocalTools.upsert(storage,type,reader(values));event.currentTarget.reset();if(type==='tasks'){event.currentTarget.elements.status.value='backlog';event.currentTarget.elements.priority.value='medium';}render();toast('Saved locally · 0 tokens');}catch(error){toast(error.message||'Could not save locally');}});
    }
    root.querySelectorAll('[data-local-panel]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.localPanel)));
    root.querySelectorAll('[data-task-status]').forEach(column=>{column.addEventListener('dragover',event=>event.preventDefault());column.addEventListener('drop',event=>{event.preventDefault();const id=event.dataTransfer.getData('text/plain');if(id){BrainyLocalTools.moveTask(storage,id,column.dataset.taskStatus);render();}});});
    bindForm('#taskForm','tasks',values=>({...values,checklist:String(values.checklist||'').split('\n')}));
    bindForm('#noteForm','notes',values=>values);bindForm('#templateForm','templates',values=>values);bindForm('#clipForm','clips',values=>values);bindForm('#decisionForm','decisions',values=>values);
    const noteForm=$('#noteForm');
    try { const scratch=JSON.parse(storage.getItem(SCRATCH_KEY)||'null'); if(scratch){noteForm.elements.title.value=scratch.title||'';noteForm.elements.body.value=scratch.body||'';} } catch {}
    noteForm.addEventListener('input',()=>{clearTimeout(scratchTimer);scratchTimer=setTimeout(()=>storage.setItem(SCRATCH_KEY,JSON.stringify({title:noteForm.elements.title.value,body:noteForm.elements.body.value})),180);});
    noteForm.addEventListener('submit',()=>{clearTimeout(scratchTimer);storage.removeItem(SCRATCH_KEY);});
    $('#focusForm').addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());BrainyLocalTools.setPreferences(storage,{focusMinutes:values.minutes});BrainyLocalTools.startFocus(storage,values.minutes,values.label);focusFinished=false;render();toast('Focus started');});
    $('#focusStop').addEventListener('click',()=>{BrainyLocalTools.stopFocus(storage);render();toast('Focus stopped');});
    $('#localSearch').addEventListener('input',()=>renderSearch(state()));
    $('#privateModeToggle').addEventListener('change',event=>{BrainyLocalTools.setPreferences(storage,{privateMode:event.target.checked});render();});
    $('#pinsWidgetToggle').addEventListener('change',event=>BrainyLocalTools.setPreferences(storage,{widgets:{pins:event.target.checked}}));
    $('#insightsWidgetToggle').addEventListener('change',event=>BrainyLocalTools.setPreferences(storage,{widgets:{insights:event.target.checked}}));
    $('#enableReminders').addEventListener('click',async()=>{if(typeof Notification==='undefined'){toast('Browser notifications are unavailable');return;}const permission=await Notification.requestPermission();toast(permission==='granted'?'Local reminders enabled':'Reminder permission not granted');if(permission==='granted')notifyDueTasks();render();});
    const timer=setInterval(()=>{const localState=state();if(localState.focus.running)renderFocus(localState);},1000);
    const reminderTimer=setInterval(notifyDueTasks,60000);
    setTimeout(notifyDueTasks,1200);
    render();
    return {show,render,renderHome,focusSearch,destroy:()=>{clearInterval(timer);clearInterval(reminderTimer);clearTimeout(scratchTimer);}};
  }
  return {create};
});
