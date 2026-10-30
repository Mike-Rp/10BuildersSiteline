import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'

test('workspace swipes validate intent, protect edits and never change browser history',async t=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/admin',pretendToBeVisual:true}),w=dom.window,previous=new Map()
  for(const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root'))
  try{
    const {default:useSwipe}=await server.ssrLoadModule('/src/useSwipeNavigation.tsx')
    const {default:useSignOut}=await server.ssrLoadModule('/src/useSignOutConfirmation.tsx')
    let exits=0,key=0,clock=1000
    const moves=[]
    function Harness({identity='admin',allowed=['Dashboard','Documents','Team'],enabled=true,overlay=false}){
      const [page,setPage]=React.useState('Documents')
      const signOut=useSignOut(()=>exits++)
      const swipe=useSwipe({identity,page,allowedPages:allowed,enabled,navigate:next=>{moves.push(next);setPage(next)},requestSignOut:signOut.request})
      return React.createElement(React.Fragment,null,
        React.createElement('div',{ref:swipe.ref},
          React.createElement('h1',null,page),React.createElement('div',{'data-canvas':true},'Swipe here'),
          React.createElement('form',null,React.createElement('textarea',{'aria-label':'Draft note',defaultValue:''})),
          React.createElement('div',{'data-horizontal':true,style:{overflowX:'auto'}},React.createElement('span',null,'Scrollable content')),
          React.createElement('div',{'aria-roledescription':'carousel'},'Carousel'),
          React.createElement('input',{type:'range'}),
          React.createElement('div',{contentEditable:true,suppressContentEditableWarning:true},'Editable'),
          React.createElement('button',{onClick:()=>setPage('Team')},'Open Team')),
        overlay?React.createElement('div',{role:'dialog'},'Existing dialog'):null,swipe.dialog,signOut.dialog)
    }
    let currentProps={}
    const render=async(props={},fresh=true)=>{currentProps=props;if(fresh)key++;await act(()=>root.render(React.createElement(Harness,{...props,key}))) }
    const page=()=>document.querySelector('h1').textContent
    const canvas=()=>document.querySelector('[data-canvas]')
    const touch=(x,y=180,id=1)=>({identifier:id,clientX:x,clientY:y})
    function emit(target,type,touches,changed,time){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed},timeStamp:{value:time}});target.dispatchEvent(e);return e}
    async function swipe(direction='right',{target=canvas(),dx=150,dy=0,duration=150,start=direction==='right'?100:300}={}){
      let move,end
      await act(()=>{const finish=start+(direction==='right'?dx:-dx);emit(target,'touchstart',[touch(start)],[],clock);move=emit(target,'touchmove',[touch(finish,180+dy)],[],clock+50);end=emit(target,'touchend',[],[touch(finish,180+dy)],clock+duration);clock+=1200})
      return {move,end}
    }
    const click=async label=>act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent===label).click())
    await t.test('one action per gesture, right to Dashboard, left to last authorized module, existing sign-out confirmation',async()=>{
      await render();const history=w.history.length
      const {move}=await swipe()
      assert.equal(move.defaultPrevented,true)
      assert.equal(page(),'Dashboard')
      await act(()=>emit(canvas(),'touchend',[],[touch(250)],clock))
      assert.equal(document.querySelector('[role=dialog]'),null,'duplicate end cannot request sign-out')
      await swipe('left');assert.equal(page(),'Documents')
      await click('Open Team');await swipe();await swipe('left');assert.equal(page(),'Team')
      await swipe();await swipe();assert.match(document.querySelector('[role=dialog]').textContent,/Sign out of 10BuildLine/)
      await swipe();assert.equal(exits,0,'a gesture never confirms sign-out')
      await click('Cancel');assert.equal(page(),'Dashboard');assert.equal(exits,0)
      await swipe();await click('Sign out');assert.equal(exits,1)
      assert.equal(w.history.length,history);assert.equal(w.location.pathname,'/admin')
    })
    await t.test('short, vertical, diagonal, slow, tap-like, cancelled and multi-touch gestures do nothing',async()=>{
      for(const options of [{dx:30},{dx:100,dy:120},{dx:110,dy:80},{duration:1600},{duration:20}]){await render();await swipe('right',options);assert.equal(page(),'Documents')}
      await render()
      await act(()=>{emit(canvas(),'touchstart',[touch(100)],[],clock);emit(canvas(),'touchcancel',[],[],clock+40);emit(canvas(),'touchend',[],[touch(300)],clock+150)})
      assert.equal(page(),'Documents')
      await act(()=>{emit(canvas(),'touchstart',[touch(100)],[],clock);emit(canvas(),'touchmove',[touch(200),touch(220,180,2)],[],clock+40);emit(canvas(),'touchend',[],[touch(300)],clock+150)})
      assert.equal(page(),'Documents')
      await swipe('left');assert.equal(page(),'Documents','left on a module does nothing')
    })
    await t.test('inputs, carousels, sliders, editable text, horizontal lists and browser edges retain their gestures',async()=>{
      await render()
      for(const selector of ['textarea','[aria-roledescription=carousel]','input[type=range]','[contenteditable]']){
        const {move}=await swipe('right',{target:document.querySelector(selector)});assert.equal(move.defaultPrevented,false);assert.equal(page(),'Documents')
      }
      const scroller=document.querySelector('[data-horizontal]');Object.defineProperties(scroller,{scrollWidth:{value:400},clientWidth:{value:100}})
      const {move}=await swipe('right',{target:scroller.querySelector('span')});assert.equal(move.defaultPrevented,false);assert.equal(page(),'Documents')
      await swipe('right',{start:5});assert.equal(page(),'Documents','native browser owns edge swipe; no custom duplicate navigation')
    })
    await t.test('open dialogs block swipes; unsaved edits require explicit leave confirmation',async()=>{
      await render({overlay:true});await swipe();assert.equal(page(),'Documents')
      await render()
      await act(()=>{const field=document.querySelector('textarea');field.dispatchEvent(new w.FocusEvent('focusin',{bubbles:true}));field.value='Unsaved note';field.dispatchEvent(new w.Event('input',{bubbles:true}))})
      await swipe();assert.equal(page(),'Documents');assert.match(document.querySelector('[role=dialog]').textContent,/Leaving may discard/)
      await click('Stay here');assert.equal(page(),'Documents');await swipe();await click('Leave page');assert.equal(page(),'Dashboard')
    })

    await t.test('dialog and backdrop horizontal wheel gestures cannot escape to browser history',async()=>{
      await render({overlay:true})
      const dialog=document.querySelector('[role=dialog]')
      const event=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:5,deltaX:-180})
      await act(()=>dialog.dispatchEvent(event))
      assert.equal(event.defaultPrevented,true,'dialog outside the workspace surface must stop horizontal browser navigation')
      const backdrop=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:5,deltaX:-180})
      await act(()=>document.body.dispatchEvent(backdrop))
      assert.equal(backdrop.defaultPrevented,true)
      assert.equal(page(),'Documents');assert.equal(exits,1)
      const vertical=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:180})
      await act(()=>dialog.dispatchEvent(vertical));assert.equal(vertical.defaultPrevented,false)
      assert.equal(document.documentElement.style.overscrollBehaviorX,'none')
      const {move}=await swipe('right',{target:dialog,start:5})
      assert.equal(move.defaultPrevented,true,'horizontal touch inside the profile is contained, including near the edge')
      const scroller=document.createElement('div');scroller.style.overflowX='auto'
      Object.defineProperties(scroller,{scrollWidth:{value:500},clientWidth:{value:100}});dialog.appendChild(scroller)
      const horizontal=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:180})
      await act(()=>scroller.dispatchEvent(horizontal));assert.equal(horizontal.defaultPrevented,false,'dialog horizontal list keeps its own scrolling')
      await render();await swipe();assert.equal(page(),'Dashboard')
      await swipe();assert.match(document.querySelector('[role=dialog]').textContent,/Sign out of 10BuildLine/)
      await click('Cancel');assert.equal(page(),'Dashboard')
    })

    await t.test('a dialog opening mid-gesture cancels touch and queued trackpad navigation',async()=>{
      await render()
      await act(()=>emit(canvas(),'touchstart',[touch(100)],[],clock))
      await render({overlay:true},false)
      await render({},false)
      await act(()=>emit(canvas(),'touchend',[],[touch(280)],clock+150))
      assert.equal(page(),'Documents','closing the intervening dialog must not revive the old gesture')
      await act(()=>canvas().dispatchEvent(new w.WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:200,deltaX:-180})))
      await render({overlay:true},false);await render({},false)
      await act(()=>new Promise(resolve=>setTimeout(resolve,260)))
      assert.equal(page(),'Documents')
    })

    await t.test('mouse drags work, taps remain normal, and dragging a card never also clicks it',async()=>{
      await render()
      const target=[...document.querySelectorAll('button')].find(b=>b.textContent==='Open Team')
      await act(()=>{
        const pointer=(type,x,buttons)=>{const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{pointerType:{value:'mouse'},pointerId:{value:7},button:{value:0},buttons:{value:buttons},isPrimary:{value:true},clientX:{value:x},clientY:{value:180},timeStamp:{value:clock+(type==='pointerdown'?0:type==='pointermove'?60:150)}});target.dispatchEvent(e)}
        pointer('pointerdown',100,1);pointer('pointermove',280,1);pointer('pointerup',280,0)
      })
      assert.equal(page(),'Dashboard')
      await act(()=>target.click());assert.equal(page(),'Dashboard','synthetic post-drag click is suppressed')
      await act(()=>target.click());assert.equal(page(),'Team','ordinary click still works')
    })
    await t.test('trackpad horizontal streams navigate once after momentum, while vertical scrolling and pinch stay native',async()=>{
      await render()
      const wheel=async(dx,dy=0,extra={})=>act(()=>canvas().dispatchEvent(new w.WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:200,clientY:180,deltaX:dx,deltaY:dy,...extra})))
      const settle=()=>act(()=>new Promise(resolve=>setTimeout(resolve,260)))
      await wheel(-60);await wheel(-60);await wheel(-40);await settle()
      assert.equal(page(),'Dashboard');assert.equal(document.querySelector('[role=dialog]'),null,'momentum does not cause a second action')
      await wheel(180);await settle();assert.equal(page(),'Documents','opposite horizontal scroll restores the module')
      await wheel(0,180);await settle();assert.equal(page(),'Documents')
      await wheel(-180,0,{ctrlKey:true});await settle();assert.equal(page(),'Documents')
    })
    await t.test('phone swipes can start on cards without activating their buttons',async()=>{
      await render()
      const target=[...document.querySelectorAll('button')].find(b=>b.textContent==='Open Team')
      await swipe('right',{target});assert.equal(page(),'Dashboard')
      await act(()=>target.click());assert.equal(page(),'Dashboard')
    })
    await t.test('disabled sessions, changed identity and revoked permissions never restore an unauthorized module',async()=>{
      await render({enabled:false});await swipe();assert.equal(page(),'Documents')
      await render();await swipe();assert.equal(page(),'Dashboard')
      await render({allowed:['Dashboard']},false);await swipe('left');assert.equal(page(),'Dashboard')
      await render({identity:'different-admin'},false);await swipe('left');assert.equal(page(),'Dashboard')
    })
  }finally{
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
