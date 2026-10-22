const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Widget = require('./work-widget');

test('widget normalizes bounded calendar and meeting-note data without trusting URLs', () => {
  const value = Widget.normalize({
    ok:true,
    calendar:{items:Array.from({length:9},(_,index)=>({id:`e${index}`,title:`Meeting ${index}`,start:`2026-10-2${index}T10:00:00+07:00`,end:`2026-10-2${index}T11:00:00+07:00`,location:'Room',url:index===1?'javascript:bad()':`https://calendar.google.com/calendar/event?eid=${index}`}))},
    notes:{needsReview:12,items:[{id:'n1',title:'Latest note',date:'2026-10-21',url:'https://app.notion.com/p/n1'}]},
    links:{calendar:'https://calendar.google.com/calendar/u/0/r/week',meetingNotes:'https://app.notion.com/p/398877a2c48b80ddb64fe8cfaff85283'},
    meta:{refreshedAt:'2026-10-22T00:00:00.000Z',tokenCost:0},
  });
  assert.equal(value.calendar.items.length,6);
  assert.equal(value.calendar.items[1].url,'');
  assert.equal(value.notes.items[0].title,'Latest note');
  assert.equal(value.notes.needsReview,12);
  assert.equal(value.meta.tokenCost,0);
});

test('standalone widget is responsive, pastel, fetch-on-open, and keeps secrets out of URLs', () => {
  const html = fs.readFileSync('work-widget.html','utf8');
  const source = fs.readFileSync('work-widget.js','utf8');
  for (const marker of ['id="activationPanel"','id="widgetContent"','id="refreshWidget"','id="calendarItems"','id="meetingNotes"']) assert.match(html,new RegExp(marker));
  for (const color of ['--wisteria','--matcha','--milkshake','--attic','--butter','--apricot','--latte']) assert.match(html,new RegExp(color));
  assert.match(source,/\/api\/brainy\/calendar-meetings/);
  assert.match(source,/headers:\s*\{['"]x-brainy-key['"]:accessKey\}/);
  assert.match(source,/\/api\/auth\/activate/);
  assert.doesNotMatch(source,/setInterval|access=\$\{|searchParams\.set\(['"]access/);
  assert.match(html,/@media\s*\(max-width:\s*640px\)/);
  const worker=fs.readFileSync('sw.js','utf8');
  assert.match(worker,/brainy-shell-v52/);
  assert.match(worker,/work-widget\.html/);
  assert.match(worker,/work-widget\.js\?v=1/);
});
