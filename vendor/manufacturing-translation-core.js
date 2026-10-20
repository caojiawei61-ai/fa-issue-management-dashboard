/* Shared, deterministic terminology and translation validation. */
(function(){
  const terms=['FA','FACA','DRI','DOE','EVT','DVT','PVT','MP','ORT','OCA','EDS','FR','Cpk','Cp','SN','PIC','CP','NG','OK','SMT','ICT','FCT','EOL','AOI','SPI','PCB','PCBA','ESD','MSA','SPC','GRR','8D','PDCA','CAPA','BOM','SOP','WI','RMA','FMEA','PPAP','APQP','IQC','IPQC','OQC','Hz','kHz','MHz','dB','mm','cm','nm','um','µm','μm','kg','mg','N','V','mA','A','C','°C','ppm'];
  const normalize=s=>String(s).replace(/\s+/g,' ').trim();
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const termPattern=new RegExp('\\b(?:'+terms.map(escape).sort((a,b)=>b.length-a.length).join('|')+')\\b','g');
  function stripProtected(text,extra=[]){
    for(const term of extra.filter(Boolean).sort((a,b)=>b.length-a.length))text=text.split(term).join('');
    return text.replace(/\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+\b/g,'').replace(/\b(?=[A-Za-z0-9._-]*\d)[A-Za-z][A-Za-z0-9]*(?:[-_.][A-Za-z0-9]+)+\b/g,'').replace(termPattern,'').replace(/https?:\/\/\S+|(?:rdar|radar):\/\/\S+/g,'').replace(/\d+(?:[.,:/-]\d+)*/g,'');
  }
  function needs(text,target,extra=[]){const clean=stripProtected(String(text),extra);return target==='en'?/[\u3400-\u9fff]/.test(clean):/[A-Za-z]/.test(clean)}
  function dictionary(pairs=[]){const en=new Map(),zh=new Map();for(const [a,b] of [...pairs,...Object.entries(globalThis.FAManufacturingGlossary||{})]){en.set(normalize(b),a);zh.set(normalize(a),b)}for(const [a,b] of Object.entries({'风险消除':'风险消减措施','失效症状':'失效现象','纠正措施/下一步':'纠正措施 / 后续措施','问题':'失效问题','日期':'发生日期','描述':'失效描述','FA发现':'FA 分析发现'}))zh.set(a,b);return{en,zh}}
  function lookup(text,target,maps){const key=normalize(text);if(!key)return text;const hit=maps[target].get(key);return hit===undefined?null:hit}
  function protect(text,extra=[]){
    const tokens=[],re=new RegExp('(?:'+extra.filter(Boolean).sort((a,b)=>b.length-a.length).map(escape).concat(terms.map(t=>'\\b'+escape(t)+'\\b'),['\\b(?=[A-Za-z0-9._-]*[A-Za-z])(?=[A-Za-z0-9._-]*\\d)[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*\\b','\\d+(?:[.,:/-]\\d+)*(?:%|％)?']).join('|')+')','g');
    return{value:text.replace(re,v=>{const id=tokens.push(v)-1;return '⟦K'+id+'⟧'}),tokens};
  }
  function restore(text,tokens){
    if(typeof text!=='string')throw new Error('Translation must be text');
    if(/\d/.test(text.replace(/⟦K\d+⟧/g,'')))throw new Error('Translation introduced an unprotected number');
    for(let i=0;i<tokens.length;i++)if(text.split('⟦K'+i+'⟧').length!==2)throw new Error('Translation changed a protected number, unit or abbreviation');
    const result=text.replace(/⟦K(\d+)⟧/g,(_,i)=>{if(tokens[i]===undefined)throw new Error('Unknown protected token');return tokens[i]});
    if(/⟦K/.test(result))throw new Error('Unresolved protected token');return result;
  }
  globalThis.FAManufacturingTranslation={version:1,terms,normalize,needs,dictionary,lookup,protect,restore};
})();
