// UI preferences only: never starts, stops, or otherwise controls the collector.
export function attachFloatingPowerPanel({holder,root,section,heading,storage,win=window}) {
  const key='cheesemoa.power.panel.v1';
  const handle=win.document.createElement('button');handle.type='button';handle.className='panel-drag';
  handle.textContent='⠿ 패널 이동';handle.setAttribute('aria-label','자동수령 패널 이동');
  handle.title='드래그 또는 방향키로 이동 · Home으로 기본 위치';
  const help=win.document.createElement('span');help.id='panel-move-help';help.className='panel-sr';help.textContent='방향키로 이동, Shift와 방향키로 크게 이동, Home으로 기본 위치';handle.setAttribute('aria-describedby',help.id);
  const hide=win.document.createElement('button');hide.type='button';hide.textContent='패널 숨기기';hide.setAttribute('aria-expanded','true');
  const restore=win.document.createElement('button');restore.type='button';restore.textContent='🪵 자동수령 패널 표시';restore.hidden=true;restore.setAttribute('aria-expanded','false');
  section.id='power-panel-body';hide.setAttribute('aria-controls',section.id);restore.setAttribute('aria-controls',section.id);
  const toolbar=win.document.createElement('div');toolbar.className='panel-toolbar';toolbar.append(handle,hide,help);heading.after(toolbar);root.append(restore);
  const css=win.document.createElement('style');css.textContent='[hidden]{display:none!important}.panel-toolbar{display:flex;gap:4px;justify-content:space-between}.panel-drag{cursor:move;touch-action:none;user-select:none}.panel-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}section{max-height:calc(100dvh - 16px);overflow:auto}';root.append(css);
  holder.style.pointerEvents='none';section.style.pointerEvents='auto';restore.style.pointerEvents='auto';
  let position=null,hidden=false,drag=null,revision=0,write=Promise.resolve();
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function clamp(x,y){const box=holder.getBoundingClientRect();return {x:Math.max(8,Math.min(x,Math.max(8,win.innerWidth-box.width-8))),y:Math.max(8,Math.min(y,Math.max(8,win.innerHeight-box.height-8)))}}
  function place(x,y){position=clamp(x,y);holder.style.left=position.x+'px';holder.style.top=position.y+'px';holder.style.right='auto';holder.style.bottom='auto'}
  function persist(){revision++;const value={hidden,position:position?{...position}:null};write=write.catch(()=>{}).then(()=>storage?.set?.({[key]:value})).catch(()=>{})}
  function visibility(value,focus=false){hidden=value;section.hidden=hidden;restore.hidden=!hidden;if(position)place(position.x,position.y);if(focus)(hidden?restore:hide).focus()}
  hide.addEventListener('click',()=>{visibility(true,true);persist()});restore.addEventListener('click',()=>{visibility(false,true);persist()});
  handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;const box=holder.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top};revision++;handle.setPointerCapture?.(event.pointerId);event.preventDefault()});
  handle.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;place(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y)});
  function end(event){if(!drag||drag.id!==event.pointerId)return;drag=null;persist()}
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
  handle.addEventListener('keydown',event=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(event.key==='Home'){position=null;holder.style.left='';holder.style.top='';holder.style.right='16px';holder.style.bottom='16px'}else if(delta){const box=holder.getBoundingClientRect(),step=event.shiftKey?40:10;place(box.left+delta[0]*step,box.top+delta[1]*step)}else return;event.preventDefault();persist()});
  win.addEventListener('resize',()=>{if(position){place(position.x,position.y);persist()}});
  // Content/status text can resize the panel independently of the viewport.
  if(win.ResizeObserver)new win.ResizeObserver(()=>{if(position){const before={...position};place(position.x,position.y);if(position.x!==before.x||position.y!==before.y)persist()}}).observe(holder);
  const initialRevision=revision;
  Promise.resolve().then(()=>storage?.get?.(key)).then(data=>{if(revision!==initialRevision)return;const value=data?.[key];if(!value||typeof value!=='object')return;visibility(value.hidden===true);if(finite(value.position?.x)&&finite(value.position?.y))place(value.position.x,value.position.y)}).catch(()=>{});
}
