/* Export the rendered report, in CSS pixels, to editable PowerPoint objects.
   The browser remains the single source of layout and line wrapping. */
(function(){
  'use strict';
  const SLIDE_W=13.333333,SLIDE_H=7.5;
  const skip='.pic-tools,.v165-transform-controls,.onepager-transform-handle,.v165-transform-handle,.v165-rotate-stem,.v165-rotate-handle,button,input,textarea,select';
  function color(css){
    if(!css||css==='transparent'||css==='none')return null;
    const m=css.match(/rgba?\(([^)]+)\)/);if(!m)return /^[#][\da-f]{6}$/i.test(css)?{color:css.slice(1)}:null;
    const a=m[1].split(/[,\s/]+/).map(Number);if(a.length>3&&a[3]===0)return null;
    return {color:a.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''),transparency:Math.round((1-(a[3]??1))*100)};
  }
  function visible(el){const s=getComputedStyle(el);return !el.matches(skip)&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&el.getClientRects().length>0}
  function lines(node){
    const result=[],range=document.createRange(),text=node.nodeValue||'',white=getComputedStyle(node.parentElement).whiteSpace;let current=null,offset=0;
    for(const char of text){const start=offset;offset+=char.length;range.setStart(node,start);range.setEnd(node,offset);const r=range.getBoundingClientRect();
      if(!r.width||!r.height){continue}
      if(!current||Math.abs(current.top-r.top)>1||r.left<current.right-1){current={text:'',left:r.left,top:r.top,right:r.right,height:r.height};result.push(current)}
      current.text+=char;current.right=Math.max(current.right,r.right);current.height=Math.max(current.height,r.height);
    }
    return result.map(line=>({...line,text:/pre|break-spaces/.test(white)?line.text:line.text.replace(/\s+/g,' ')})).filter(line=>line.text.trim());
  }
  async function create(source,meta){
    await document.fonts.ready;
    await Promise.all([...source.querySelectorAll('img')].map(img=>img.decode().catch(()=>{throw new Error('An image could not be loaded: '+(img.alt||'PIC'))})));
    const bounds=source.getBoundingClientRect();if(bounds.width<1||bounds.height<1)throw new Error('Open the One-pager before exporting');
    const scale=Math.min(SLIDE_W/bounds.width,SLIDE_H/bounds.height),ox=(SLIDE_W-bounds.width*scale)/2,oy=(SLIDE_H-bounds.height*scale)/2;
    const ppt=new PptxGenJS();ppt.layout='LAYOUT_WIDE';ppt.author='FA Issue Management';ppt.title=meta.title;ppt.subject='One-pager matching browser preview · '+(meta.buildId||'share-r6');
    const slide=ppt.addSlide();slide.background={color:'FFFFFF'};
    const box=r=>({x:ox+(r.left-bounds.left)*scale,y:oy+(r.top-bounds.top)*scale,w:r.width*scale,h:r.height*scale});
    const type=ppt.ShapeType;
    function tierStyle(element,computed){
      if(!element)return computed;
      const tier=element.closest('.format2-box,.format2-label,.format2-summary td,.onepager-table .value-cell');
      if(!tier)return computed;
      const base=getComputedStyle(tier);
      // Keep emphasis and color, but obtain the point size from the semantic tier.
      return {fontSize:base.fontSize,fontFamily:base.fontFamily,color:computed.color,fontWeight:computed.fontWeight,fontStyle:computed.fontStyle,textDecorationLine:computed.textDecorationLine};
    }
    function text(value,r,s,extra={}){
      if(!value.trim())return;const fontPx=parseFloat(s.fontSize)||12,b=box(r);
      // Office otherwise substitutes emoji glyphs for diagonal arrows.
      const arrow=value.trim().replace(/[\uFE0E\uFE0F]/g,'');
      if(['↗','→','↘'].includes(arrow)){
        const dy=arrow==='↗'?-b.h*.55:arrow==='↘'?b.h*.55:0;
        slide.addShape(type.line,{x:b.x+b.w*.15,y:b.y+b.h*.5-dy/2,w:b.w*.7,h:dy,line:{color:color(s.color)?.color||'777777',width:Math.max(.6,fontPx*scale*72*.08),endArrowType:'triangle'}});return;
      }
      slide.addText(value,{...b,w:b.w+.025,h:Math.max(b.h,fontPx*1.25*scale),fontFace:s.fontFamily.split(',')[0].replace(/["']/g,''),fontSize:fontPx*scale*72,lang:/[\u3400-\u9fff]/.test(value)?'zh-CN':'en-US',color:color(s.color)?.color||'111111',bold:parseInt(s.fontWeight)>=600,italic:s.fontStyle==='italic',underline:s.textDecorationLine.includes('underline'),strike:s.textDecorationLine.includes('line-through'),margin:0,paraSpaceAfterPt:0,paraSpaceBeforePt:0,breakLine:false,wrap:false,valign:'top',...extra});
    }
    function background(el,s,r){
      const fill=color(s.backgroundColor),radius=parseFloat(s.borderTopLeftRadius)||0;
      const sides=['Top','Right','Bottom','Left'].map(side=>({side,width:parseFloat(s['border'+side+'Width'])||0,style:s['border'+side+'Style'],color:color(s['border'+side+'Color'])}));
      const hasBorder=sides.some(b=>b.width&&b.color&&!['none','hidden'].includes(b.style));
      if(!fill&&!hasBorder)return;
      const uniform=sides.every(b=>b.width===sides[0].width&&b.style===sides[0].style&&b.color?.color===sides[0].color?.color);
      if(fill||(hasBorder&&uniform)){
        const border=sides[0];slide.addShape(radius?type.roundRect:type.rect,{...box(r),radius:radius*scale,rectRadius:radius*scale,fill:fill||{color:'FFFFFF',transparency:100},line:hasBorder&&uniform?{...border.color,width:border.width*scale*72,dashType:border.style==='dashed'?'dash':border.style==='dotted'?'dot':'solid'}:{color:'FFFFFF',transparency:100,width:0}});
      }
      if(hasBorder&&!uniform)sides.forEach(b=>{if(!b.width||!b.color||['none','hidden'].includes(b.style))return;const horizontal=['Top','Bottom'].includes(b.side),x=r.left+(b.side==='Right'?r.width:0),y=r.top+(b.side==='Bottom'?r.height:0);slide.addShape(type.line,{...box({left:x,top:y,width:horizontal?r.width:0,height:horizontal?0:r.height}),line:{...b.color,width:b.width*scale*72,dashType:b.style==='dashed'?'dash':'solid'}})});
    }
    function image(img){
      const r=img.getBoundingClientRect(),s=getComputedStyle(img),clip=img.closest('.pic-visual,.v166-image-clip,.pic-slot,.format2-pic')||img,cr=clip.getBoundingClientRect();
      const canvas=document.createElement('canvas'),pixelScale=Math.min(2,4096/Math.max(cr.width,cr.height));canvas.width=Math.max(1,Math.round(cr.width*pixelScale));canvas.height=Math.max(1,Math.round(cr.height*pixelScale));
      const ctx=canvas.getContext('2d');ctx.scale(pixelScale,pixelScale);const radius=parseFloat(getComputedStyle(clip).borderTopLeftRadius)||0;if(radius&&ctx.roundRect){ctx.beginPath();ctx.roundRect(0,0,cr.width,cr.height,radius);ctx.clip()}let w=r.width,h=r.height;
      if(s.objectFit==='contain'||s.objectFit==='cover'){const ratio=(s.objectFit==='cover'?Math.max:Math.min)(r.width/img.naturalWidth,r.height/img.naturalHeight);w=img.naturalWidth*ratio;h=img.naturalHeight*ratio}
      const pos=s.objectPosition.split(' '),position=(v,free)=>v?.endsWith('%')?parseFloat(v)/100*free:parseFloat(v)||0;
      ctx.drawImage(img,r.left-cr.left+position(pos[0],r.width-w),r.top-cr.top+position(pos[1]||pos[0],r.height-h),w,h);
      slide.addImage({data:canvas.toDataURL('image/png'),...box(cr)});
    }
    function svg(el){
      const host=el.closest('[data-custom-id],.pic-annotation')||el,r=host.getBoundingClientRect(),s=getComputedStyle(host),shape=el.querySelector('ellipse,rect,line,polygon');if(!shape)return;
      const ss=getComputedStyle(shape),fill=color(ss.fill),stroke=color(ss.stroke),b=box(r),matrix=s.transform.match(/^matrix\(([^)]+)\)/),parts=matrix?.[1].split(',').map(Number),rotate=parts?Math.atan2(parts[1],parts[0])*180/Math.PI:0;
      const bw=host.offsetWidth||r.width,bh=host.offsetHeight||r.height;if(rotate){b.x+=(b.w-bw*scale)/2;b.y+=(b.h-bh*scale)/2;b.w=bw*scale;b.h=bh*scale}
      const options={...b,rotate,fill:fill||{color:'FFFFFF',transparency:100},line:stroke?{...stroke,width:(parseFloat(ss.strokeWidth)||1)*Math.min(b.w,b.h)/100*72}:{color:'FFFFFF',transparency:100,width:0}};
      if(shape.tagName.toLowerCase()==='line'){const vb=el.viewBox.baseVal,x1=+shape.getAttribute('x1'),x2=+shape.getAttribute('x2'),y1=+shape.getAttribute('y1'),y2=+shape.getAttribute('y2');slide.addShape(type.line,{x:b.x+b.w*x1/(vb.width||100),y:b.y+b.h*y1/(vb.height||100),w:b.w*(x2-x1)/(vb.width||100),h:b.h*(y2-y1)/(vb.height||100),rotate,line:{...options.line,endArrowType:el.querySelector('polygon')||ss.markerEnd!=='none'?'triangle':undefined}})}
      else {const tag=shape.tagName.toLowerCase(),kind=tag==='ellipse'?type.ellipse:tag==='rect'?(+shape.getAttribute('rx')?type.roundRect:type.rect):(shape.getAttribute('points')||'').trim().split(/\s+/).length===3?type.triangle:type.parallelogram;slide.addShape(kind,options)}
    }
    function visit(el){
      if(!visible(el))return;
      const s=getComputedStyle(el),r=el.getBoundingClientRect();if(r.width<=0||r.height<=0)return;
      if(el.tagName==='svg'||el.tagName==='SVG'){svg(el);return}
      if(el.matches('.onepager-custom-item.text')&&(s.transform!=='none'||s.writingMode!=='horizontal-tb')){
        const parts=s.transform.match(/^matrix\(([^)]+)\)/)?.[1].split(',').map(Number),angle=parts?Math.atan2(parts[1],parts[0])*180/Math.PI:0;
        if(Math.abs(angle)>.01||s.writingMode!=='horizontal-tb'){
          const w=el.offsetWidth,h=el.offsetHeight,frame={left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,width:w,height:h},fill=color(s.backgroundColor),stroke=color(s.borderTopColor);
          slide.addShape(type.rect,{...box(frame),rotate:angle,fill:fill||{color:'FFFFFF',transparency:100},line:{color:stroke?.color||'FFFFFF',transparency:parseFloat(s.borderTopWidth)?0:100,width:(parseFloat(s.borderTopWidth)||0)*scale*72}});
          const padding=parseFloat(s.paddingLeft)||0;
          text([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''),{left:frame.left+padding,top:frame.top+(parseFloat(s.paddingTop)||0),width:Math.max(1,w-padding*2),height:Math.max(1,h-padding*2)},s,{rotate:angle,vert:s.writingMode!=='horizontal-tb'?'eaVert':undefined,wrap:true});return;
        }
      }
      background(el,s,r);
      if(el.tagName==='IMG'){image(el);return}
      if(el.tagName==='LI'){
        const first=[...el.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(first){const firstLine=lines(first)[0];if(firstLine){const ordered=el.parentElement.tagName==='OL',i=[...el.parentElement.children].indexOf(el)+(Number(el.parentElement.getAttribute('start'))||1),font=parseFloat(s.fontSize);text(ordered?i+'.':'•',{left:firstLine.left-font*1.4,top:firstLine.top,width:font*1.2,height:firstLine.height},tierStyle(el,s),{align:'right'})}}
      }
      for(const node of el.childNodes){if(node.nodeType===1)visit(node);else if(node.nodeType===3&&node.nodeValue.trim()){for(const line of lines(node))text(line.text,{left:line.left,top:line.top,width:line.right-line.left,height:line.height},tierStyle(el,s))}}
    }
    visit(source);
    return {ppt,slide,width:bounds.width,height:bounds.height};
  }
  window.FAOnepagerPpt={create};
})();
