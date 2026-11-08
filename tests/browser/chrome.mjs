import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'

export const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(file=>fs.existsSync(file))
export const delay = ms => new Promise(resolve=>setTimeout(resolve,ms))

export async function launchChrome(args=[]) {
  const root=path.resolve('tmp')
  fs.mkdirSync(root,{recursive:true})
  const profile=fs.mkdtempSync(path.join(root,'login-back-chrome-'))
  const child=spawn(chromePath,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-proxy-server','--no-first-run','--no-default-browser-check',...args,'about:blank'],{stdio:'ignore',windowsHide:true})
  const exited=new Promise(resolve=>child.once('exit',resolve))
  const active=path.join(profile,'DevToolsActivePort')
  for(let n=0;n<200&&!fs.existsSync(active);n++)await delay(50)
  const port=fs.readFileSync(active,'utf8').split('\n')[0]
  const pages=[]
  return {
    async page() {
      const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json()
      const ws=new WebSocket(target.webSocketDebuggerUrl)
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Chrome connection timed out')),5000)
        ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true})
        ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Chrome connection failed'))},{once:true})
      })
      let id=0
      const pending=new Map()
      ws.addEventListener('message',event=>{
        const message=JSON.parse(event.data)
        const task=pending.get(message.id)
        if(!task)return
        pending.delete(message.id)
        clearTimeout(task.timer)
        message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result)
      })
      const call=(method,params={})=>new Promise((resolve,reject)=>{
        if(ws.readyState!==WebSocket.OPEN){reject(Error('Chrome page connection closed'));return}
        const key=++id
        const timer=setTimeout(()=>{pending.delete(key);reject(Error(method+' timed out'))},10000)
        pending.set(key,{resolve,reject,timer})
        ws.send(JSON.stringify({id:key,method,params}))
      })
      const evaluate=async expression=>{
        const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
        if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description)
        return result.result.value
      }
      const page={call,evaluate,ws,
        async wait(expression) {
          for(let n=0;n<200;n++){if(await evaluate(expression))return;await delay(50)}
          const message='Browser condition timed out: '+expression+'; '+await evaluate('document.body.innerText.slice(0,300)')
          console.error(message)
          throw Error(message)
        },
        async click(selector) {
          let coords,previous,stable=0
          for(let n=0;n<100;n++) {
            coords=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return r.width&&r.height&&hit&&el.contains(hit)?{x,y}:null})()`)
            stable=coords&&previous&&Math.abs(coords.x-previous.x)<0.5&&Math.abs(coords.y-previous.y)<0.5?stable+1:0
            if(stable>=2)break
            previous=coords
            await delay(25)
          }
          if(!coords||stable<2)throw Error('Click target not visible/stable: '+selector)
          await call('Input.dispatchMouseEvent',{type:'mousePressed',...coords,button:'left',clickCount:1})
          await call('Input.dispatchMouseEvent',{type:'mouseReleased',...coords,button:'left',clickCount:1})
        },
        async back() {
          const history=await call('Page.getNavigationHistory')
          await call('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id})
        },
        async forward() {
          const history=await call('Page.getNavigationHistory')
          await call('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex+1].id})
        },
      }
      await call('Page.enable');await call('Runtime.enable')
      pages.push(page)
      return page
    },
    async close() {
      const control=await this.page().catch(()=>undefined)
      await control?.call('Browser.close').catch(()=>{})
      for(const page of pages)page.ws.close()
      if(child.exitCode===null)child.kill()
      await exited
      if(profile.startsWith(root+path.sep))fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})
    },
  }
}
