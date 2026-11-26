import {createServer} from 'vite';
import {chromium} from 'file:///C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});let browser;
const results=[];
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tmp/project-setup-requests-3-4/index.html');
 await page.getByRole('button',{name:'Skip for now',exact:true}).click();
 const tabs=page.locator('.project-setup-tabs');await tabs.waitFor();
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});
  const metrics=await tabs.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,buttons:[...el.children].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,scroll:b.scrollWidth,client:b.clientWidth,top:b.getBoundingClientRect().top}))}));
  assert.ok(metrics.scroll<=metrics.width+1,'tabs overflow '+width);
  for(const b of metrics.buttons){assert.ok(b.height>=42);assert.ok(b.scroll<=b.client+1,'clipped tab '+width)}
  if(width>=1024)assert.ok(Math.max(...metrics.buttons.map(b=>b.width))-Math.min(...metrics.buttons.map(b=>b.width))<1,'unequal tabs');
  await page.screenshot({path:`tmp/project-setup-requests-3-4/tabs-${width}.png`,fullPage:true});results.push({width,tabs:metrics});
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('tab',{name:/Inquiry queue/}).click();
 const queue=page.locator('.opm-inquiry-queue');const cards=queue.locator('.opm-inquiry-card');
 await cards.first().waitFor();assert.equal(await cards.count(),3);
 assert.equal(await queue.locator('.opm-inquiry-pipeline,h1,h2,.opm-inquiry-pipeline-label').count(),0);
 assert.equal(await queue.getByRole('button',{name:'Refresh inquiries',exact:true}).count(),0);
 const responsibility=queue.getByRole('group',{name:'Intake responsibility',exact:true});
 const all=responsibility.getByRole('button',{name:/All inquiries/});
 assert.match(await all.innerText(),/\(3\)/);
 await responsibility.getByRole('button',{name:/Needs your action/}).click();assert.equal(await cards.count(),2);
 await responsibility.getByRole('button',{name:/Waiting for others/}).click();assert.equal(await cards.count(),1);assert.match(await cards.innerText(),/Market annex/);
 await all.click();
 const search=queue.getByRole('searchbox',{name:'Search inquiries'});
 const status=queue.locator('label').filter({hasText:/^Status/}).locator('select');
 const type=queue.locator('label').filter({hasText:/^Project type/}).locator('select');
 await type.selectOption('Commercial');assert.equal(await cards.count(),1);assert.match(await cards.innerText(),/Harbor shop/);
 const waitingStatus=await status.locator('option').evaluateAll(options=>options.find(o=>o.textContent.includes('Waiting for client')).value);
 await status.selectOption(waitingStatus);assert.equal(await cards.count(),0);
 await type.selectOption('Mixed-Use');assert.equal(await cards.count(),1);assert.match(await cards.innerText(),/Market annex/);
 await status.selectOption('');await type.selectOption('');await search.fill('harbor');assert.equal(await cards.count(),1);
 assert.match(await all.innerText(),/\(3\)/,'counts stay independent of search');
 await search.fill('missing inquiry');assert.equal(await cards.count(),0);await queue.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await cards.count(),3);
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'queue overflow '+width);
  const controls=await queue.locator('.opm-inquiry-controls').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,border:getComputedStyle(el).borderWidth,inputs:[...el.querySelectorAll('input,select')].map(i=>({width:i.clientWidth,scroll:i.scrollWidth}))}));
  assert.ok(controls.scroll<=controls.width+1);assert.equal(controls.border,'0px');
  await page.screenshot({path:`tmp/project-setup-requests-3-4/queue-${width}.png`,fullPage:true});results.find(r=>r.width===width).queue=controls;
 }
 for(const name of [/Setup overview/,/Assignment responses/,/Inquiry queue/]){await page.getByRole('tab',{name}).click();assert.equal(await page.getByRole('tab',{name}).getAttribute('aria-selected'),'true')}
 await page.setViewportSize({width:1440,height:1000});
 await search.fill('QA Residence');await page.locator('button[aria-label$="for QA Residence"]').click();
 await page.locator('.office-review-form').waitFor();assert.match(await page.locator('.office-workflow-back').innerText(),/Back$/);
 assert.equal(await page.locator('#inquiry-review-reason').count(),0,'unchanged form does not require a reason');
 await page.locator('.office-workflow-back').click();await queue.waitFor();assert.equal(await search.inputValue(),'QA Residence');assert.equal(await cards.count(),1);
 await page.locator('button[aria-label$="for QA Residence"]').click();
 await page.locator('.office-review-form').waitFor();
 const radio=page.locator('input[name="review-technical"]');await radio.first().focus();await radio.first().press('ArrowRight');assert.equal(await radio.nth(1).isChecked(),true);assert.equal(await radio.nth(1).evaluate(el=>getComputedStyle(el.parentElement).outlineStyle),'solid');await radio.nth(1).press('ArrowLeft');assert.equal(await radio.first().isChecked(),true);
 const save=page.getByRole('button',{name:'Save and continue',exact:true});
 const budget=page.locator('#inquiry-review-budget');
 const lot=page.locator('#inquiry-review-lot_area');await lot.fill('0000200');assert.equal(await lot.inputValue(),'0,000,200','other fields retain zeros');await lot.fill('200');
 await budget.fill('000050000');await assert.doesNotReject(()=>page.waitForFunction(()=>document.querySelector('#inquiry-review-budget').value==='50,000'));
 assert.equal(await budget.evaluate(el=>el.selectionStart),6,'caret after normalized paste');
 await budget.fill('0.50');assert.equal(await budget.inputValue(),'0.50');assert.equal(await save.isDisabled(),true);
 await budget.fill('');assert.equal(await budget.inputValue(),'');assert.equal(await save.isDisabled(),true);
 await budget.fill('0');await budget.press('0');assert.equal(await budget.inputValue(),'0','same-value zero insertion restores display');
 await budget.fill('12345');await budget.evaluate(el=>el.setSelectionRange(3,3));await budget.press('Backspace');assert.equal(await budget.inputValue(),'1,345');assert.equal(await budget.evaluate(el=>el.selectionStart),1);
 await budget.fill('12345');await budget.evaluate(el=>el.setSelectionRange(1,1));await budget.press('Delete');assert.equal(await budget.inputValue(),'1,345');assert.equal(await budget.evaluate(el=>el.selectionStart),1);
 await budget.fill('');await page.evaluate(()=>navigator.clipboard.writeText('000020000000'));await budget.press('Control+V');assert.equal(await budget.inputValue(),'20,000,000');
 assert.equal(await save.isDisabled(),false,'valid form enabled before contract');
 const initialRequests=await page.evaluate(()=>qaRequests.length);
 const tests=[['#inquiry-review-name','', 'QA Residence'],['#inquiry-review-address','   ','Quezon City'],['#inquiry-review-floor_count','0','2'],['#inquiry-review-area-per-floor','19.99','200'],['#inquiry-review-area-per-floor','340.01','200'],['#inquiry-start-date','2020-01-01','2080-01-12'],['#inquiry-completion-date','2080-01-13',null],['#inquiry-review-budget','9999999999999','20000000'],['#inquiry-review-budget','20000000.001','20000000']];
 for(const [id,invalid,valid] of tests){
  const input=page.locator(id);const before=await input.inputValue();await input.fill(invalid);assert.equal(await save.isDisabled(),true,'invalid '+id);
  assert.ok((await page.locator('#inquiry-review-guidance').innerText()).length);
  await page.locator('form.office-workflow-form').evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(await page.evaluate(()=>qaSaves.length),0,'submit guard '+id);
  await input.fill(valid??before);
 }
 await page.locator('#inquiry-review-floor_count').fill('13');
 await page.locator('.office-review-form label').filter({hasText:/^Floor sizes/}).locator('select').selectOption('individual');
 await page.getByRole('button',{name:'Next floors',exact:true}).click();
 await page.locator('#inquiry-review-floor-level-13').fill('');
 await page.getByRole('button',{name:'Previous floors',exact:true}).click();
 await page.locator('#inquiry-review-guidance a').click();
 assert.equal(await page.evaluate(()=>document.activeElement.id),'inquiry-review-floor-level-13','guidance opens the invalid floor page');
 await page.locator('#inquiry-review-floor-level-13').fill('200');
 await page.locator('.office-review-form label').filter({hasText:/^Floor sizes/}).locator('select').selectOption('same');
 await page.locator('#inquiry-review-floor_count').fill('2');
 await page.locator('#inquiry-review-address').fill('Updated address');assert.equal(await save.isDisabled(),true,'missing reason');
 await page.locator('#inquiry-review-reason').fill('   ');assert.equal(await save.isDisabled(),true,'whitespace reason');
 assert.equal(await page.locator('#inquiry-review-reason').evaluate(el=>el.tagName),'TEXTAREA');
 assert.equal(await page.locator('#inquiry-review-reason').getAttribute('maxlength'),'1000');
 assert.match(await page.locator('#inquiry-review-reason-error').innerText(),/Enter a reason/);
 await page.locator('#inquiry-review-reason').fill('Client updated the address.\nThe revised documents confirm the location.');assert.equal(await save.isDisabled(),false);
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});
  const metrics=await page.evaluate(()=>{
   const aside=document.querySelector('.office-admin-submission'),edit=document.querySelector('.office-review-form');const a=aside.getBoundingClientRect(),b=edit.getBoundingClientRect();
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,aside:{top:a.top,left:a.left,height:a.height,bottom:a.bottom},edit:{top:b.top,left:b.left,height:b.height},options:[...document.querySelectorAll('.office-review-options')].map(el=>({columns:getComputedStyle(el.firstElementChild.nextElementSibling).gridTemplateColumns,scroll:el.scrollWidth,width:el.clientWidth,labels:[...el.querySelectorAll('label')].map(l=>({height:l.getBoundingClientRect().height,display:getComputedStyle(l).display,overflow:l.scrollWidth>l.clientWidth+1}))}))};
  });
  assert.equal(metrics.overflow,false,'page overflow '+width);
  assert.ok(metrics.aside.height<metrics.edit.height,'admin card stretched '+width);
  assert.ok(metrics.edit.top>=metrics.aside.bottom,'summary above edit at '+width);
  assert.ok(Math.abs(metrics.edit.left-metrics.aside.left)<1,'full width alignment '+width);
  if(width<=768)assert.ok(metrics.aside.top<metrics.edit.top,'reading order '+width);
  for(const group of metrics.options){assert.ok(group.scroll<=group.width+1,'radio overflow');for(const label of group.labels){assert.ok(label.height>=44);assert.equal(label.display,'flex');assert.equal(label.overflow,false)}}
  assert.equal(await page.locator('.office-admin-submission').count(),1);
  const reasonBox=await page.locator('#inquiry-review-reason').boundingBox();const budgetBox=await page.locator('.office-review-budget').boundingBox();
  assert.ok(reasonBox.height>=140);assert.ok(reasonBox.width>=budgetBox.width-30,'reason uses full budget width');
  await page.locator('#inquiry-review-reason').fill('   ');assert.equal(await save.isDisabled(),true);
  const footer=await page.locator('.office-review-footer').evaluate(el=>{const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width}};return {duration:rect(el.querySelector('.office-review-duration')),message:rect(el.querySelector('#inquiry-review-guidance')),actions:rect(el.querySelector('.office-workflow-actions')),width:el.clientWidth}});
  const disabledStyle=await save.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity}));
  assert.ok(footer.message.width>=footer.width-30,'validation message has a full row');
  assert.ok(footer.message.top>=footer.duration.bottom,'message below duration');
  assert.ok(footer.message.top>=footer.actions.bottom || footer.message.bottom<=footer.actions.top,'message separate from buttons');
  assert.match(await page.locator('#inquiry-review-guidance').innerText(),/Reason for changes/);
  await page.screenshot({path:`tmp/project-setup-requests-3-4/invalid-review-${width}.png`,fullPage:true});
  await page.locator('#inquiry-review-reason').fill('Client updated the address.\nThe revised documents confirm the location.');assert.equal(await save.isDisabled(),false);
  await page.waitForTimeout(100);
  const enabledStyle=await save.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity}));
  assert.notDeepEqual(enabledStyle,disabledStyle,'enabled and disabled appearances differ');
  await page.screenshot({path:`tmp/project-setup-requests-3-4/review-${width}.png`,fullPage:true});results.find(r=>r.width===width).review=metrics;
 }
 await page.setViewportSize({width:1440,height:1000});
 const upload=async name=>{
  await page.locator('input[aria-label="Signed client contract file"]').setInputFiles({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});
  await page.getByRole('button',{name:'Upload this file',exact:true}).click();
  await page.getByRole('dialog',{name:'Upload signed contract',exact:true}).waitFor({state:'hidden'});
 };
 await upload('signed-first.pdf');
 assert.match(await page.locator('.inquiry-contract-preview').innerText(),/Uploaded . awaiting confirmation/);
 const confirmation=page.getByRole('checkbox',{name:/I have reviewed the currently uploaded file/});
 assert.equal(await confirmation.isChecked(),false);assert.equal(await confirmation.evaluate(el=>getComputedStyle(el.parentElement).display),'flex');const requestCount=await page.evaluate(()=>qaRequests.length);
 await confirmation.check();assert.equal(await confirmation.isChecked(),true);assert.equal(await page.evaluate(()=>qaRequests.length),requestCount,'confirmation has no request');
 await upload('signed-replacement.pdf');assert.equal(await confirmation.isChecked(),false,'replacement reset');
 await save.click();await page.getByRole('button',{name:'Complete assessment',exact:true}).waitFor();
 const proceed=page.getByRole('button',{name:'Continue to construction phases',exact:true});assert.equal(await proceed.isDisabled(),true,'assessment required');
 await page.getByRole('button',{name:'Complete assessment',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('button')?.textContent?.includes('Saving'));
 await page.getByRole('button',{name:'Complete assessment',exact:true}).waitFor({state:'hidden'});
 assert.equal(await proceed.isDisabled(),true,'uploaded file alone insufficient');
 await page.getByRole('button',{name:'View contract',exact:true}).click();await page.getByRole('dialog',{name:'Signed contract preview',exact:true}).waitFor();await page.getByRole('dialog',{name:'Signed contract preview',exact:true}).getByRole('button',{name:'Close dialog',exact:true}).click();
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});assert.equal(await proceed.isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'unconfirmed overflow '+width);
  await page.screenshot({path:`tmp/project-setup-requests-3-4/unconfirmed-${width}.png`,fullPage:true});
 }
 const requestsBefore=await page.evaluate(()=>qaRequests.length);await confirmation.check();assert.equal(await proceed.isDisabled(),false);assert.equal(await page.evaluate(()=>qaRequests.length),requestsBefore);
 await confirmation.uncheck();assert.equal(await proceed.isDisabled(),true);await confirmation.check();
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});assert.equal(await proceed.isDisabled(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'confirmed overflow '+width);
  await page.screenshot({path:`tmp/project-setup-requests-3-4/confirmed-${width}.png`,fullPage:true});
 }
 await proceed.click();await page.getByRole('dialog',{name:'Project setup',exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>qaRequests.filter(r=>r.path.endsWith('/planning')))).length,1);
 assert.deepEqual(errors,[]);await writeFile('tmp/project-setup-requests-3-4/results.json',JSON.stringify(results,null,2));console.log('PASS: compact queue filtering/counts/tabs; unchanged Back destination; summary above edit; multiline whitespace validation; full-width footer guidance; six responsive widths; budget typing/paste/caret/deletion; required fields/floors/dates/budget/reasons; guarded submit; upload/preview/confirm/replacement; assessment/continue guard; no browser errors.');
}finally{await browser?.close();await server.close()}
