/* Semantic FA import: native tables, labelled text, separate headings and rich text runs. */
(function(){
  const aliases={title:['Issue','Issue description','Problem','Failure title','Title','失效问题','问题','问题描述','标题'],desc:['Failure symptom','Failure description','Symptom','Description','失效现象','失效描述','现象描述'],station:['Station','Risk area','Area','Process','工站','工序','风险区域','区域'],sn:['SN','Serial number','Serial no.','Serial no','Serial #','序列号'],fr:['FR','F/R','Failure rate','Fail rate','失效率','不良率'],category:['Category','Failure category','类别','失效类别'],hypothesis:['Hypothesis / Pending validation','Root cause / Hypothesis','Hypothesis','Root cause','Potential root cause','假设 / 待验证','根本原因 / 假设','失效假设','根因假设','根本原因','假设'],impact:['Impact / Risk','Impact','Risk impact','影响 / 风险','影响','风险影响'],findings:['Failure Analysis','FA Findings','FA Steps','Analysis findings','Analysis','失效分析','FA 分析发现','FA发现','FA步骤','分析发现'],next:['De-risk','De-risk Actions','Next steps','Next step','Containment','Containment actions','风险消除措施','风险消减措施','后续步骤','后续措施','围堵措施'],corrective:['Corrective Action/Next step','Corrective Actions','Corrective action','Corrective action / Next step','Next Step/Corrective action','纠正措施 / 下一步','纠正措施/下一步','纠正措施'],dri:['DRI','Owner','Responsible engineer','负责人'],radar:['Radar','Radar ID','Radar编号'],occurrenceDate:['Occurrence date','Date','发生日期','日期'],dueDate:['Due date','Target date','CP','截止日期','计划完成日期'],risk:['Risk / FA maturity','Risk level','Risk','Status','风险 / FA成熟度','风险等级','状态'],trend:['Trend','Issue trend','趋势','问题趋势']};
  const normalize=s=>String(s||'').replace(/[：:]+$/,'').replace(/[\s/_-]+/g,'').toLowerCase();
  const names=new Map(Object.entries(aliases).flatMap(([key,values])=>values.map(value=>[normalize(value),key])));
  const identify=s=>names.get(normalize(s));
  function prefix(text){const match=String(text).match(/^\s*([^:：\n]{1,70})\s*[:：]\s*([\s\S]*)$/);return match&&identify(match[1])?{key:identify(match[1]),value:match[2].trim()}:null}
  const elements=(node,local)=>Array.from(node.getElementsByTagNameNS('*',local));
  const paragraphs=node=>elements(node,'p').map(p=>elements(p,'t').map(t=>t.textContent).join('')).filter(s=>s.trim());
  function bounds(node){const xfrm=elements(node,'xfrm')[0],off=xfrm&&elements(xfrm,'off')[0],ext=xfrm&&elements(xfrm,'ext')[0];return{x:Number(off?.getAttribute('x')||0),y:Number(off?.getAttribute('y')||0),w:Number(ext?.getAttribute('cx')||0),h:Number(ext?.getAttribute('cy')||0)}}
  async function parse(zip){
    const fields={},origins={},warnings=[];const put=(key,value,origin,priority=1)=>{value=String(value||'').trim();if(!value||identify(value))return;if(!Object.hasOwn(fields,key)||priority>(origins[key]?.priority||0)){fields[key]=value;origins[key]={origin,priority}}};
    const slideNames=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
    for(const slideName of slideNames){
      const xml=new DOMParser().parseFromString(await zip.file(slideName).async('string'),'application/xml');if(elements(xml,'parsererror').length)throw Error('Invalid slide XML');
      for(const table of elements(xml,'tbl')){
        const tableRows=elements(table,'tr').map(row=>Array.from(row.children).filter(c=>c.localName==='tc').map(cell=>paragraphs(cell).join('\n').trim()));
        for(let r=0;r<tableRows.length;r++){
          const cells=tableRows[r],headers=cells.map(identify),headerCount=headers.filter(Boolean).length;
          if(headerCount>=Math.max(2,Math.ceil(cells.length*.6))&&tableRows[r+1]){headers.forEach((key,i)=>key&&put(key,tableRows[r+1][i],slideName+' table column',4));r++;continue}
          for(let c=0;c<cells.length;c++){const key=identify(cells[c]);if(key&&cells[c+1]&&!identify(cells[c+1])){put(key,cells[c+1],slideName+' table pair',4);c++}else{const label=prefix(cells[c]);if(label)put(label.key,label.value,slideName+' table label',4)}}
        }
      }
      const shapes=elements(xml,'sp').filter(node=>!node.closest?.('a\\:tc')).map(node=>({lines:paragraphs(node),...bounds(node)})).filter(shape=>shape.lines.length);
      for(const shape of shapes){
        let key=null,parts=[];const flush=()=>{if(key&&parts.length)put(key,parts.join('\n'),slideName+' text block',3);key=null;parts=[]};
        for(const line of shape.lines){const label=prefix(line),heading=identify(line);if(label||heading){flush();key=label?.key||heading;if(label?.value)parts.push(label.value)}else if(key)parts.push(line)}flush();
      }
      // A separate label and value may be to the right or immediately below in a different text box.
      for(const label of shapes.filter(shape=>shape.lines.length===1&&identify(shape.lines[0]))){
        const key=identify(label.lines[0]);if(origins[key]?.priority>=3)continue;
        const candidates=shapes.filter(value=>value!==label&&!identify(value.lines[0])&&!prefix(value.lines[0])).map(value=>{
          const overlap=Math.min(label.x+label.w,value.x+value.w)-Math.max(label.x,value.x),sameRow=Math.abs((label.y+label.h/2)-(value.y+value.h/2))<=Math.max(label.h,value.h)*.65;
          if(sameRow&&value.x>=label.x+label.w-20000)return{value,score:(value.x-label.x-label.w)+Math.abs(value.y-label.y)*2};
          if(value.y>=label.y+label.h-20000&&overlap>=Math.min(label.w,value.w)*.4)return{value,score:(value.y-label.y-label.h)*2+Math.abs(value.x-label.x)};
          return null;
        }).filter(Boolean).sort((a,b)=>a.score-b.score);
        if(candidates[0])put(key,candidates[0].value.lines.join('\n'),slideName+' adjacent value',2);
      }
      if(!fields.title){const candidate=shapes.filter(s=>!identify(s.lines[0])&&!prefix(s.lines[0])&&s.y<2000000).sort((a,b)=>a.y-b.y||a.x-b.x)[0];if(candidate)put('title',candidate.lines.join(' '),slideName+' slide title',.5)}
    }
    if(!fields.title&&fields.desc)fields.title=fields.desc.split('\n')[0];if(!fields.desc&&fields.title)fields.desc=fields.title;
    for(const key of ['findings','next'])if(fields[key])fields[key]=fields[key].split('\n').map(s=>s.replace(/^\s*(?:[•●▪-]|\d+[.)])\s*/,'').trim()).filter(Boolean);
    for(const key of ['occurrenceDate','dueDate'])if(fields[key]){const m=fields[key].match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);if(m&&Number(m[2])>=1&&Number(m[2])<=12&&Number(m[3])>=1&&Number(m[3])<=new Date(Number(m[1]),Number(m[2]),0).getDate())fields[key]=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;else{warnings.push(key);delete fields[key]}}
    if(fields.fr&&!/^F\/?R\s*[:：]/i.test(fields.fr))fields.fr='FR: '+fields.fr;
    if(fields.radar)fields.radar=fields.radar.replace(/^r(?:a|d)ar:\/\//i,'');
    if(fields.risk){const value=fields.risk.toLowerCase();fields.risk=/closed|关闭|结案/.test(value)?'closed':/emerging|新出现/.test(value)?'emerging':/medium|中风险/.test(value)?'medium':/low|低风险/.test(value)?'low':/high|高风险/.test(value)?'high':null;if(!fields.risk)delete fields.risk}
    if(fields.trend){const value=fields.trend.toLowerCase();fields.trend=/better|改善|↘/.test(value)?'better':/worse|恶化|↗/.test(value)?'worse':'neutral'}
    return{fields,origins,warnings,slideCount:slideNames.length};
  }
  globalThis.FAPptImporter={parse};
})();
