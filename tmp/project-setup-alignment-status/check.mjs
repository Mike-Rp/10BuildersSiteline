import {createServer} from 'vite';
import {chromium} from 'file:///C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const dir='tmp/project-setup-alignment-status';
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error',plugins:[{name:'fixture-refresh',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]==='/opm/project-intake')req.url='/'+dir+'/index.html';next()})}}]});let browser;
const results=[];
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1920,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+dir+'/index.html');
 const skip=page.getByRole('button',{name:'Skip for now',exact:true});if(await skip.isVisible())await skip.click();
 const tabs=page.locator('.project-setup-tabs');await tabs.waitFor();
 const frame=async label=>{
  const m=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};
   const pane=document.querySelector('.project-setup-content > [role=tabpanel]:not([hidden])');
   return {bar:rect(document.querySelector('.project-setup-tabs')),pane:rect(pane),children:[...pane.querySelectorAll('.project-inquiries,.opm-inquiry-pipeline,.opm-confirmation-card,.office-review-form')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth+1,titleInFrame:!![...document.querySelectorAll('h1')].find(h=>h.textContent==='Project setup')?.closest('.project-setup-content')};
  });
  assert.equal(m.overflow,false,label+' overflow');assert.equal(m.titleInFrame,false,'title unchanged');assert.ok(m.bar.width<=1320+1);
  for(const item of [m.pane,...m.children]){assert.ok(Math.abs(item.left-m.bar.left)<1,label+' left edge');assert.ok(Math.abs(item.right-m.bar.right)<1,label+' right edge')}
  results.push({label,...m});
 };
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});
  for(const [name,key] of [[/Inquiry queue/,'inquiries'],[/Setup overview/,'overview'],[/Assignment responses/,'responses']]){
   await page.getByRole('tab',{name}).click();await frame(key+'-'+width);await page.screenshot({path:`${dir}/${key}-${width}.png`,fullPage:true});
  }
  await page.getByRole('tab',{name:/Inquiry queue/}).click();await page.locator('button[aria-label$="for QA Residence"]').click();await page.locator('.office-review-form').waitFor();await frame('detail-'+width);await page.screenshot({path:`${dir}/detail-${width}.png`,fullPage:true});await page.locator('.office-workflow-back').click();
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('button[aria-label$="for QA Residence"]').click();
 const badge=page.locator('.inquiry-contract-status'),check=page.locator('.inquiry-contract-confirmation input');
 const assertStatus=async text=>{await page.waitForFunction(text=>document.querySelector('.inquiry-contract-status')?.textContent===text,text);assert.equal(await badge.locator('svg').count(),1);return badge.evaluate(el=>getComputedStyle(el).backgroundColor)};
 const missingColor=await assertStatus('Not uploaded');
 const upload=async name=>{await page.locator('input[aria-label="Signed client contract file"]').setInputFiles({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});await page.getByRole('button',{name:'Upload this file',exact:true}).click();await page.getByRole('dialog',{name:'Upload signed contract',exact:true}).waitFor({state:'hidden'})};
 const reload=async()=>{await page.reload();await tabs.waitFor();if(await skip.isVisible())await skip.click();await page.getByRole('tab',{name:/Inquiry queue/}).click();await page.locator('button[aria-label$="for QA Residence"]').click();await page.locator('.office-review-form').waitFor()};
 await upload('signed-first.pdf');const awaiting='Uploaded \u00b7 Awaiting confirmation';const awaitingColor=await assertStatus(awaiting);assert.equal(await check.isChecked(),false);assert.ok(await page.getByRole('button',{name:'Replace signed contract',exact:true}).isVisible());
 await reload();await assertStatus(awaiting);assert.equal(await check.isChecked(),false);
 const requestCount=await page.evaluate(()=>qaRequests.length);await check.check();const confirmedColor=await assertStatus('Confirmed');assert.equal(await page.evaluate(()=>qaRequests.length),requestCount,'no confirmation API call');
 await reload();await assertStatus('Confirmed');assert.equal(await check.isChecked(),true);
 await check.uncheck();await reload();await assertStatus(awaiting);assert.equal(await check.isChecked(),false);
 await check.check();await upload('signed-replacement.pdf');await assertStatus(awaiting);assert.equal(await check.isChecked(),false);assert.match(await page.locator('.inquiry-contract-preview').innerText(),/signed-replacement.pdf/);
 await reload();await assertStatus(awaiting);assert.equal(await check.isChecked(),false);
 assert.equal(new Set([missingColor,awaitingColor,confirmedColor]).size,3,'distinct badge colors');
 for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:1000});await frame('awaiting-'+width);await page.screenshot({path:`${dir}/awaiting-${width}.png`,fullPage:true});await check.check();await assertStatus('Confirmed');await page.screenshot({path:`${dir}/confirmed-${width}.png`,fullPage:true});await check.uncheck()}
 await check.check();await reload();await assertStatus('Confirmed');await page.getByRole('button',{name:'View contract',exact:true}).click();await page.getByRole('dialog',{name:'Signed contract preview',exact:true}).waitFor();
 assert.deepEqual(errors,[]);await writeFile(dir+'/results.json',JSON.stringify(results,null,2));console.log('PASS: all three tab panels and inline details align with the centered 1320px tab frame at six widths; title unchanged; distinct badge icons/colors; upload/confirmation/unchecking/replacement survive real page reloads; preview preserved; no browser errors or overflow.');
}finally{await browser?.close();await server.close()}
