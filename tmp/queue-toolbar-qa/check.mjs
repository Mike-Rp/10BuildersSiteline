import {createServer} from 'vite';
import {chromium} from 'file:///C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=async(single=false)=>{await page.goto(server.resolvedUrls.local[0]+'tmp/queue-toolbar-qa/index.html'+(single?'?single':''));const skip=page.getByRole('button',{name:'Skip for now',exact:true});if(await skip.isVisible())await skip.click();await page.getByRole('tab',{name:/Inquiry queue/}).click();await page.locator('.opm-inquiry-card').first().waitFor()};
 await open();const toolbar=page.locator('.opm-inquiry-controls');const cards=page.locator('.opm-inquiry-card');
 const search=page.getByRole('searchbox',{name:'Search inquiries'}),view=page.getByLabel('Queue view',{exact:true}),status=page.getByLabel('Status',{exact:true}),type=page.getByLabel('Project type',{exact:true});
 assert.equal(await toolbar.locator('input,select').count(),4);assert.equal(await toolbar.locator('.intake-tabs').count(),0);
 assert.deepEqual(await view.locator('option').allTextContents(),['All inquiries (3)','Needs your action (2)','Waiting for others (1)']);
 await view.selectOption('action');assert.equal(await cards.count(),2);await view.selectOption('waiting');assert.equal(await cards.count(),1);assert.match(await cards.innerText(),/Market annex/);await view.selectOption('all');
 await type.selectOption('Commercial');assert.equal(await cards.count(),1);assert.match(await cards.innerText(),/Harbor shop/);
 const waiting=await status.locator('option').evaluateAll(options=>options.find(o=>o.textContent.includes('Waiting for client')).value);await status.selectOption(waiting);assert.equal(await cards.count(),0);
 await type.selectOption('Mixed-Use');assert.equal(await cards.count(),1);await status.selectOption('');await type.selectOption('');await search.fill('harbor');assert.equal(await cards.count(),1);assert.equal(await view.locator('option[value=all]').textContent(),'All inquiries (3)');await search.fill('');
 const help=page.getByRole('button',{name:'Help: Queue view',exact:true});await help.click();await page.getByRole('dialog',{name:'Who needs to act?',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await help.evaluate(el=>el===document.activeElement),true);
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});
  const m=await toolbar.evaluate(el=>{
   const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};
   return {toolbar:rect(el),card:rect(document.querySelector('.opm-inquiry-card')),background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth,controls:[...el.querySelectorAll('input,select')].map(rect),labels:[...el.querySelectorAll('.opm-inquiry-filter')].map(n=>n.querySelector('label').textContent),overflow:document.documentElement.scrollWidth>innerWidth+1,columns:getComputedStyle(el.querySelector('.opm-inquiry-filters')).gridTemplateColumns.split(' ').length};
  });
  assert.equal(m.background,'rgb(255, 255, 255)');assert.equal(m.border,'1px');assert.equal(m.overflow,false);
  assert.deepEqual(m.labels,['Search','Queue view','Status','Project type']);assert.ok(Math.abs(m.toolbar.left-m.card.left)<1);assert.ok(Math.abs(m.toolbar.right-m.card.right)<1);
  for(const c of m.controls)assert.equal(c.height,48,'equal heights');
  const expected=width>=1440?4:width>=768?2:1;assert.equal(m.columns,expected,'column count '+width);
  for(let i=0;i<m.controls.length;i+=expected){const row=m.controls.slice(i,i+expected);assert.ok(Math.max(...row.map(c=>c.top))-Math.min(...row.map(c=>c.top))<1);assert.ok(Math.max(...row.map(c=>c.bottom))-Math.min(...row.map(c=>c.bottom))<1)}
  if(expected===4)assert.ok(m.controls[0].width>m.controls[1].width);
  await page.screenshot({path:`tmp/queue-toolbar-qa/toolbar-${width}.png`,fullPage:true});results.push({width,...m});
 }
 await open(true);assert.deepEqual(await view.locator('option').allTextContents(),['All inquiries (1)','Needs your action (1)','Waiting for others (0)']);await view.selectOption('waiting');assert.equal(await cards.count(),0);await view.selectOption('action');assert.equal(await cards.count(),1);
 assert.deepEqual(errors,[]);await writeFile('tmp/queue-toolbar-qa/results.json',JSON.stringify(results,null,2));console.log('PASS: white bordered toolbar aligned with cards; four labeled equal-height controls; 4/2/1 responsive columns; dynamic 3-record and 1-record counts; combined search/queue/status/type filters; keyboard help; no browser errors or overflow.');
}finally{await browser?.close();await server.close()}
