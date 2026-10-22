(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.BrainyWorkWidget=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function text(value,limit=240){return String(value||'').replace(/\s+/g,' ').trim().slice(0,limit);}
  function safeUrl(value,hosts){
    try{
      const url=new URL(String(value||''));
      if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash) return '';
      if(!hosts.some(host=>url.hostname===host||url.hostname.endsWith(`.${host}`))) return '';
      return url.toString().slice(0,2048);
    }catch{return '';}
  }
  function normalize(payload){
    if(!payload||payload.ok!==true) throw new Error('Live workspace data is unavailable');
    const calendarItems=(Array.isArray(payload.calendar?.items)?payload.calendar.items:[]).slice(0,6).map(item=>({
      id:text(item?.id,100),title:text(item?.title,180),start:text(item?.start,50),end:text(item?.end,50),location:text(item?.location,180),
      url:safeUrl(item?.url,['google.com','googleusercontent.com']),
    })).filter(item=>item.id&&item.title&&item.start);
    const noteItems=(Array.isArray(payload.notes?.items)?payload.notes.items:[]).slice(0,3).map(item=>({
      id:text(item?.id,100),title:text(item?.title,180),date:text(item?.date,50),status:text(item?.status,80),
      url:safeUrl(item?.url,['notion.com','notion.so']),
    })).filter(item=>item.id&&item.title);
    const needsReview=Math.max(0,Math.min(999,Math.trunc(Number(payload.notes?.needsReview)||0)));
    return {
      calendar:{items:calendarItems},notes:{items:noteItems,needsReview},
      links:{
        calendar:safeUrl(payload.links?.calendar,['google.com']),
        meetingNotes:safeUrl(payload.links?.meetingNotes,['notion.com','notion.so']),
      },
      meta:{refreshedAt:text(payload.meta?.refreshedAt,50),tokenCost:payload.meta?.tokenCost===0?0:null},
    };
  }

  function startLabel(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  }
  function dateLabel(value){
    const date=new Date(`${String(value||'').slice(0,10)}T00:00:00+07:00`);
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',day:'numeric',month:'short'}).format(date);
  }
  function appendLinkList(container,items,kind){
    container.replaceChildren();
    if(!items.length){
      const empty=document.createElement('p');empty.className='empty';empty.textContent=kind==='calendar'?'No upcoming timed meetings.':'No dated meeting notes yet.';container.append(empty);return;
    }
    for(const item of items){
      const row=document.createElement(item.url?'a':'div');row.className='item';
      if(item.url){row.href=item.url;row.target='_blank';row.rel='noopener noreferrer';}
      const title=document.createElement('strong');title.textContent=item.title;
      const meta=document.createElement('span');
      meta.textContent=kind==='calendar'?[startLabel(item.start),item.location].filter(Boolean).join(' · '):[dateLabel(item.date),item.status].filter(Boolean).join(' · ');
      row.append(title,meta);container.append(row);
    }
  }

  async function init(){
    const $=selector=>document.querySelector(selector);
    const activationPanel=$('#activationPanel'),widgetContent=$('#widgetContent'),activationForm=$('#activationForm'),activationCode=$('#activationCode');
    const status=$('#widgetStatus'),refresh=$('#refreshWidget'),calendarItems=$('#calendarItems'),meetingNotes=$('#meetingNotes'),reviewCount=$('#reviewCount');
    let backendUrl=(localStorage.getItem('brainy_backend')||location.origin).replace(/\/$/,'');
    let accessKey=localStorage.getItem('brainy_access')||'';
    try{
      const response=await fetch('./backend.json',{cache:'no-store'});
      if(response.ok){const config=await response.json();if(/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(config.backend||'')){backendUrl=config.backend.replace(/\/$/,'');localStorage.setItem('brainy_backend',backendUrl);}}
    }catch{}
    function showActivation(message='Enter the private BRAINY activation code once for this embedded view.'){
      activationPanel.hidden=false;widgetContent.hidden=true;status.textContent=message;
    }
    function showContent(){activationPanel.hidden=true;widgetContent.hidden=false;}
    async function load(){
      if(!accessKey){showActivation();return;}
      showContent();refresh.disabled=true;status.textContent='Refreshing live sources…';
      try{
        const response=await fetch(`${backendUrl}/api/brainy/calendar-meetings`,{headers:{'x-brainy-key':accessKey},cache:'no-store'});
        if(response.status===404){accessKey='';localStorage.removeItem('brainy_access');showActivation('Access expired. Activate this embedded view again.');return;}
        if(!response.ok) throw new Error('Live sources could not be refreshed');
        const snapshot=normalize(await response.json());
        appendLinkList(calendarItems,snapshot.calendar.items,'calendar');
        appendLinkList(meetingNotes,snapshot.notes.items,'notes');
        reviewCount.textContent=String(snapshot.notes.needsReview);
        const refreshed=new Date(snapshot.meta.refreshedAt);
        status.textContent=`Live · refreshed ${Number.isNaN(refreshed.getTime())?'now':new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(refreshed)} WIB · 0 AI tokens`;
        const calendarLink=$('#openCalendar'),notesLink=$('#openNotes');
        if(snapshot.links.calendar) calendarLink.href=snapshot.links.calendar;
        if(snapshot.links.meetingNotes) notesLink.href=snapshot.links.meetingNotes;
      }catch(error){status.textContent=text(error?.message,180)||'Live sources could not be refreshed.';}
      finally{refresh.disabled=false;}
    }
    activationForm.addEventListener('submit',async event=>{
      event.preventDefault();const code=text(activationCode.value,200);if(!code)return;
      status.textContent='Activating…';
      try{
        const response=await fetch(`${backendUrl}/api/auth/activate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});
        if(!response.ok) throw new Error('Activation code was not accepted');
        const data=await response.json();accessKey=text(data.access,500);if(!accessKey)throw new Error('Activation returned no access');
        localStorage.setItem('brainy_access',accessKey);activationCode.value='';await load();
      }catch(error){showActivation(text(error?.message,180)||'Activation failed.');}
    });
    refresh.addEventListener('click',load);
    await load();
  }
  if(typeof document!=='undefined') document.addEventListener('DOMContentLoaded',()=>{init().catch(()=>{});});
  return {normalize,text,safeUrl,startLabel,dateLabel};
});
