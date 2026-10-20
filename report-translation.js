/* Translate a complete display copy; the FA source record is never overwritten. */
(function(){
  const core=FAManufacturingTranslation,sources=new WeakMap(),jobs=new WeakMap();let current=null;
  const ui=(lang,en,zh)=>lang==='zh'?zh:en;
  function restoreForEdit(node){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){if(sources.has(text))text.nodeValue=sources.get(text)}}
  function render(detail,lang,options){
    const canvas=detail.querySelector('.onepager');if(!canvas)return;
    current?.observer?.disconnect();current?.controller.abort();
    jobs.get(canvas)?.controller.abort();
    const controller=new AbortController(),job={canvas,lang,controller,ready:false,detail,options};jobs.set(canvas,job);current=job;
    const heading=detail.querySelector(':scope>.detail-head>div:first-child');let status=heading?.querySelector('[data-report-language]');
    if(!status&&heading){status=document.createElement('p');status.dataset.reportLanguage='status';status.setAttribute('role','status');heading.appendChild(status)}
    if(status)status.style.color='';
    if(status)status.textContent=ui(lang,'Translating the complete report…','正在翻译整份报告……');
    canvas.style.visibility='hidden';canvas.dataset.reportLanguageState='pending';canvas.setAttribute('aria-busy','true');
    const maps=core.dictionary(options.labels),entries=[],cache=options.cache;
    if(cache.version!==core.version){for(const key of Object.keys(cache))delete cache[key];cache.version=core.version}
    cache[lang]=cache[lang]||{};
    const roots=[canvas,...detail.querySelectorAll(':scope>.detail-head>div:first-child>h2,:scope>.detail-head>div:first-child>p:first-of-type,:scope>.detail-head .onepager-actions>.tag')];
    for(const root of roots){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
      const parent=node.parentElement;if(!parent||!parent.getClientRects().length||parent.closest('button,input,textarea,svg,.pic-tools,.v165-transform-controls'))continue;
      if(['none','hidden'].includes(getComputedStyle(parent).display)||getComputedStyle(parent).visibility==='collapse')continue;
      const field=parent.closest('[data-inline-field]')?.dataset.inlineField;
      if(['dri','sn','radar','occurrenceDate','dueDate'].includes(field))continue;
      const source=sources.has(node)?sources.get(node):node.nodeValue;sources.set(node,source);
      if(!source.trim())continue;entries.push({node,source,parts:source.split(/(\n)/)});
    }}
    const missing=new Map(),known=new Map(),terms=options.terms||[];
    for(const entry of entries)for(const part of entry.parts){
      if(!part.trim()||known.has(part))continue;
      const prefix=part.match(/^(\s*\d+[.)]\s*)([\s\S]*)$/),body=prefix?prefix[2]:part,local=core.lookup(body,lang,maps),key=core.normalize(body);
      if(local!==null)known.set(part,(prefix?.[1]||'')+local);
      else if(!core.needs(body,lang,terms))known.set(part,part);
      else if(Object.hasOwn(cache[lang],key)&&!core.needs(cache[lang][key],lang,terms))known.set(part,(prefix?.[1]||'')+cache[lang][key]);
      else missing.set(key,{text:body});
    }
    job.promise=(async()=>{
      try{
        if(missing.size){
          if(location.protocol==='file:')throw new Error(ui(lang,'Start the local service and configure a model to translate new content.','请通过启动脚本打开，并在 AI 设置中配置模型，以翻译新增正文。'));
          const pending=[...missing.entries()].map(([key,value],index)=>({id:String(index),text:value.text,key}));
          const response=await fetch('/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({targetLanguage:lang,texts:pending.map(({id,text})=>({id,text})),protectedTerms:terms})});
          const payload=await response.json();if(!response.ok)throw new Error(payload.code==='TRANSLATION_MODEL_REQUIRED'?ui(lang,'Configure a model to translate new report text.','新增报告正文需要配置模型。'):(payload.error||'Translation unavailable'));
          if(!Array.isArray(payload.translations)||payload.translations.length!==pending.length)throw new Error('Incomplete translation');
          const results=new Map(payload.translations.map(item=>[item.id,item.text]));
          for(const item of pending){const value=results.get(item.id);if(typeof value!=='string'||!value.trim()||core.needs(value,lang,terms))throw new Error(ui(lang,'Translation still contains untranslated content.','译文仍有未翻译内容。'));cache[lang][item.key]=value}
          options.save?.();
          for(const entry of entries)for(const part of entry.parts)if(part.trim()&&!known.has(part)){const prefix=part.match(/^(\s*\d+[.)]\s*)([\s\S]*)$/),body=prefix?prefix[2]:part;known.set(part,(prefix?.[1]||'')+cache[lang][core.normalize(body)])}
        }
        if(controller.signal.aborted||!canvas.isConnected||current!==job)return;
        for(const entry of entries)entry.node.nodeValue=entry.parts.map(part=>known.get(part)??part).join('');
        canvas.style.visibility='';canvas.dataset.reportLanguageState='ready';canvas.dataset.reportLanguage=lang;canvas.setAttribute('aria-busy','false');
        job.ready=true;options.layout?.();
        job.observer=new MutationObserver(()=>{if(current!==job||canvas.querySelector('[contenteditable="true"]'))return;cancelAnimationFrame(job.refreshFrame);job.refreshFrame=requestAnimationFrame(()=>{if(current===job&&canvas.isConnected)render(detail,lang,options)})});
        job.observer.observe(canvas,{childList:true,subtree:true});
        if(status)status.textContent=ui(lang,'Report language: English · identifiers and abbreviations preserved. Edit fields in their source language.','报告语言：中文 · 保留标识符及专业缩写。编辑字段时显示原文。');
      }catch(error){
        if(controller.signal.aborted||!canvas.isConnected||current!==job)return;
        canvas.dataset.reportLanguageState='error';canvas.setAttribute('aria-busy','false');
        if(status){status.style.color='#a52828';status.textContent=ui(lang,'Full-report translation is not ready. Configure a model in AI Settings, then retry. ','全文翻译未完成。请在 AI 设置中配置模型后重试。 ')+error.message;const retry=document.createElement('button');retry.className='btn';retry.textContent=ui(lang,'Retry translation','重试翻译');retry.onclick=()=>render(detail,lang,options);status.append(' ',retry)}
      }
    })();
    return job.promise;
  }
  async function ensureReady(){const job=current;if(!job)throw new Error('Open the report first');await job.promise;if(!job.ready||job.canvas.dataset.reportLanguageState!=='ready'||job.lang!==(/^zh/i.test(document.documentElement.lang)?'zh':'en')||!job.canvas.isConnected)throw new Error(ui(job.lang,'Complete report translation before exporting.','请先完成整份报告的翻译，再导出。'))}
  // Custom table editing also starts from the source, never from the display translation.
  document.addEventListener('dblclick',event=>{const cell=event.target.closest?.('.onepager-custom-table td');if(cell&&current?.canvas.contains(cell)){restoreForEdit(cell);current.canvas.dataset.reportLanguageState='editing'}},true);
  document.addEventListener('focusout',event=>{const cell=event.target.closest?.('.onepager-custom-table td'),job=current;if(!cell||!job?.canvas.contains(cell))return;setTimeout(()=>{if(current!==job||!cell.isConnected)return;const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())sources.set(node,node.nodeValue);render(job.detail,job.lang,job.options)},0)},true);
  window.FAReportTranslator={render,restoreForEdit,ensureReady};
})();
