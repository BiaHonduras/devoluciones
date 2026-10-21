// Browser export fills the styled, native-chart XLSX template in reports/.
// The template is authored with @oai/artifact-tool; JSZip only packages it.
const DAY=86400000,OFFSET=25569-6/24;
const xml=v=>String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const unxml=v=>v.replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
const numeric=(v,label)=>{const n=Number(v);if(v===null||v===undefined||v===''||!Number.isFinite(n))throw new Error(`Dato numérico inválido: ${label}.`);return n};
export function excelDate(value){if(value===null||value===undefined||value==='')return null;const ms=new Date(value).getTime();if(!Number.isFinite(ms))throw new Error('El reporte contiene una fecha inválida.');return ms/DAY+OFFSET}
const duration=(a,b)=>a!==null&&b!==null?Math.max(0,(b-a)*24):null;
const sum=a=>a.reduce((s,n)=>s+n,0),avg=a=>a.length?sum(a)/a.length:null;
const f=(formula,value)=>({formula,value});
const cellValue=v=>v&&typeof v==='object'&&'formula'in v?v.value:v;
const quote=ref=>'"="&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE('+ref+',"~","~~"),"*","~*"),"?","~?")';
const labelDay=serial=>new Intl.DateTimeFormat('es-HN',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date((serial-25569)*DAY));

export function buildReportModel(input,catalogs={},scope={}){
 const seen=new Set(),source=[];
 for(const r of input){const key=r.id||r.gestion;if(!key)throw new Error('Una devolución no tiene número de gestión.');if(seen.has(key))throw new Error(`La gestión ${r.gestion} está duplicada.`);seen.add(key);source.push(r)}
 const users=new Map((catalogs.usuarios||[]).map(u=>[String(u.id),u.nombre_corto||u.usuario||u.correo||`Usuario ${u.id}`]));
 const duplicates=new Map();for(const name of users.values())duplicates.set(name,(duplicates.get(name)||0)+1);
 const manager=id=>id===null||id===undefined?'Sin gestor':(users.has(String(id))?users.get(String(id))+(duplicates.get(users.get(String(id)))>1?` [${id}]`:''):`Usuario ${id}`);
 const sites=new Map((catalogs.sedes||[]).map(s=>[s.codigo,s.nombre]));
 const records=source.map(r=>{
  const times=[r.fecha_registro,r.fecha_entrega_liquidadora,r.fecha_nota_debito,r.fecha_ingreso_gp,r.fecha_finalizado].map(excelDate);if(times[0]===null)throw new Error(`La gestión ${r.gestion} no tiene fecha de registro.`);
  const items=(r.devoluciones_detalle||[]).map(i=>{const quantity=numeric(i.cantidad,'cantidad'),unit=numeric(i.costo_unitario,'costo unitario'),cost=numeric(i.costo_total,'costo de línea');if(quantity<=0||unit<0||cost<0)throw new Error('El reporte contiene una cantidad o costo no válido.');if(Math.abs(Math.round(quantity*unit*100)/100-cost)>0.011)throw new Error(`Revisa el costo del producto ${i.codigo} en ${r.gestion}.`);return {...i,quantity,unit,cost}});
  return {...r,times,items,site:sites.get(r.sede)||r.sede,manager:manager(r.gestor_n1),manager2:manager(r.gestor_n2),manager4:manager(r.gestor_n4),reason:r.observacion||'Sin motivo',day:Math.floor(times[0]),cost:sum(items.map(i=>i.cost)),stages:[duration(times[0],times[1]),duration(times[1],times[2]),duration(times[2],times[3])],elapsed:duration(times[0],times[3])};
 }).sort((a,b)=>b.times[0]-a.times[0]||String(a.gestion).localeCompare(String(b.gestion)));
 const allGroups=key=>{const m=new Map();for(const r of records)m.set(r[key],(m.get(r[key])||0)+1);return [...m].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es'))};
 const reasons=allGroups('reason'),managers=allGroups('manager');
 const top=entries=>{const a=entries.slice(0,7).map((e,i)=>({...e,index:i}));if(entries.length>7)a.push({label:'Otros',count:sum(entries.slice(7).map(e=>e.count)),index:7,other:true});return a.length?a:[{label:'Sin registros',count:0,index:0}]};
 const min=records.length?Math.min(...records.map(r=>r.day)):Math.floor(excelDate(new Date())),max=records.length?Math.max(...records.map(r=>r.day)):min;
 const step=Math.max(1,Math.ceil((max-min+1)/31)),periods=[];for(let start=min;start<=max;start+=step){const end=Math.min(start+step-1,max);const rs=records.filter(r=>r.day>=start&&r.day<=end);periods.push({label:step===1?labelDay(start):`${labelDay(start)}–${labelDay(end)}`,start,end,total:rs.length,resolved:rs.filter(r=>r.estado==='Finalizada').length,active:rs.filter(r=>!['Finalizada','Anulada'].includes(r.estado)).length,cancelled:rs.filter(r=>r.estado==='Anulada').length})}
 const selected=records.map(r=>r.elapsed).filter(v=>v!==null);
 const metrics={count:records.length,mean:avg(selected),resolved:records.filter(r=>r.estado==='Finalizada').length,managers:new Set(records.filter(r=>r.gestor_n1!==null&&r.gestor_n1!==undefined).map(r=>String(r.gestor_n1))).size,cost:sum(records.map(r=>r.cost)),active:records.filter(r=>!['Finalizada','Anulada'].includes(r.estado)).length,lines:sum(records.map(r=>r.items.length))};metrics.ratio=metrics.count?metrics.resolved/metrics.count:0;
 const stages=[0,1,2].map(i=>{const values=records.map(r=>r.stages[i]).filter(v=>v!==null);return{mean:avg(values),count:values.length}});
 return {records,reasons,managers,topReasons:top(reasons),topManagers:top(managers),periods,min,max,metrics,stages,scope,siteList:['Todas',...new Set(records.map(r=>r.site))].sort((a,b)=>a==='Todas'?-1:b==='Todas'?1:a.localeCompare(b,'es')),managerList:['Todos',...managers.map(x=>x.label)],stateList:['Todos',...new Set(records.map(r=>r.estado))].sort((a,b)=>a==='Todos'?-1:b==='Todos'?1:a.localeCompare(b,'es'))};
}

function rowStyles(xmlText,row){const body=xmlText.match(new RegExp(`<x:row\\b[^>]*\\br="${row}"[^>]*>([\\s\\S]*?)<\\/x:row>`))?.[1]||'';const map={};for(const match of body.matchAll(/<x:c\b([^>]*?)(?:\/>|>[\s\S]*?<\/x:c>)/g)){const ref=match[1].match(/\br="([A-Z]+)\d+"/)?.[1],style=match[1].match(/\bs="(\d+)"/)?.[1];if(ref)map[ref]=style||'0'}return map}
function writeCell(ref,value,style='0'){
 const attrs=`r="${ref}" s="${style}"`;
 if(value&&typeof value==='object'&&'formula'in value){const v=value.value;return `<x:c ${attrs}${typeof v==='string'?' t="str"':''}><x:f>${xml(value.formula.replace(/^=/,''))}</x:f>${v===null||v===undefined?'':`<x:v>${xml(v)}</x:v>`}</x:c>`}
 if(value===null||value===undefined||value==='')return `<x:c ${attrs}/>`;
 if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('El archivo contiene un número no válido.');return `<x:c ${attrs}><x:v>${value}</x:v></x:c>`}
 return `<x:c ${attrs} t="inlineStr"><x:is><x:t xml:space="preserve">${xml(value)}</x:t></x:is></x:c>`;
}
function replaceData(xmlText,rows,start,stylesRow=start){
 const style=rowStyles(xmlText,stylesRow);const body=xmlText.match(/<x:sheetData>([\s\S]*?)<\/x:sheetData>/)?.[1]||'';
 const keep=[...body.matchAll(/<x:row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/x:row>/g)].filter(m=>Number(m[1])<start).map(m=>m[0]).join('');
 const actual=rows.length?rows:[Array(Object.keys(style).length).fill(null)];const data=actual.map((values,i)=>`<x:row r="${start+i}" ht="23" customHeight="1">${values.map((v,j)=>writeCell(col(j)+(start+i),v,style[col(j)]||'0')).join('')}</x:row>`).join('');
 return xmlText.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/,`<x:sheetData>${keep}${data}</x:sheetData>`);
}
function patchCells(xmlText,changes){const pending=new Map(Object.entries(changes));let out=xmlText.replace(/<x:c\b([^>]*?)(?:\/>|>[\s\S]*?<\/x:c>)/g,(raw,attrs)=>{const ref=attrs.match(/\br="([A-Z]+\d+)"/)?.[1];if(!pending.has(ref))return raw;const value=pending.get(ref);pending.delete(ref);return writeCell(ref,value,attrs.match(/\bs="(\d+)"/)?.[1]||'0')});if(pending.size)throw new Error('La plantilla del dashboard está incompleta: '+[...pending.keys()].join(', '));return out}
function rangeValues(ref,cells){const m=unxml(ref).match(/'?Resumen'?!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)/);if(!m||m[1]!==m[3])return[];const a=[];for(let row=Number(m[2]);row<=Number(m[4]);row++)a.push(cellValue(cells.get(m[1]+row)));return a}
function updateChart(text,cells,model,index){
 if(index===1)text=text.replace(/(\$[HIJK]\$4:\$[HIJK]\$)34/g,(_,p)=>p+(3+model.periods.length));
 if(index===2)text=text.replace(/(\$(?:AD|AE)\$4:\$(?:AD|AE)\$)11/g,(_,p)=>p+(3+model.topReasons.length));
 if(index===4)text=text.replace(/(\$(?:AG|AH)\$4:\$(?:AG|AH)\$)11/g,(_,p)=>p+(3+model.topManagers.length));
 text=text.replace(/<c:(strRef|numRef)>([\s\S]*?)<\/c:\1>/g,(raw,type,body)=>{const ref=body.match(/<c:f>([\s\S]*?)<\/c:f>/)?.[1];if(!ref)return raw;const values=rangeValues(ref,cells);const cacheType=type==='strRef'?'strCache':'numCache';const cache=`<c:${cacheType}>${type==='numRef'?'<c:formatCode>General</c:formatCode>':''}<c:ptCount val="${values.length}"/>${values.map((v,i)=>v===null||v===undefined||v===''?'':`<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`).join('')}</c:${cacheType}>`;body=body.replace(new RegExp(`<c:${cacheType}(?:\\s[^>]*)?\\/>|<c:${cacheType}(?:\\s[^>]*)?>[\\s\\S]*?<\\/c:${cacheType}>`),cache);return `<c:${type}>${body}</c:${type}>`});
 if(index===2){const palette=['345A40','B89358','81936A','866649','C3B38F','536C59','A47453','B9BDB0'];const points=model.topReasons.map((_,i)=>`<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:srgbClr val="${palette[i]}"/></a:solidFill></c:spPr></c:dPt>`).join('');text=text.replace(/(<c:ser>[\s\S]*?)(<c:cat>)/,(_,a,b)=>a+points+b);}
 if(index===4){text=text.replace(/<c:barDir val="col"\s*\/>/,'<c:barDir val="bar"/>');text=text.replace(/<c:catAx>[\s\S]*?<\/c:catAx>/g,s=>s.replace(/<c:axPos val="[a-z]"\s*\/>/,'<c:axPos val="l"/>').replace(/<c:orientation val="minMax"\s*\/>/,'<c:orientation val="maxMin"/>'));text=text.replace(/<c:valAx>[\s\S]*?<\/c:valAx>/g,s=>s.replace(/<c:axPos val="[a-z]"\s*\/>/,'<c:axPos val="b"/>'));}
 if(index===1||index===4)text=text.replace(/<c:valAx>[\s\S]*?<\/c:valAx>/g,s=>s.replace('</c:valAx>','<c:majorUnit val="'+Math.max(1,Math.ceil(Math.max(...(index===1?model.periods.map(p=>p.total):model.topManagers.map(p=>p.count)),1)/5))+'"/></c:valAx>'));
 return text.replace('val="en-US"','val="es-HN"');
}

export async function createDashboardXlsx({rows,catalogs,scope={},template,Zip=globalThis.JSZip}){
 if(!Zip)throw new Error('No se cargó el generador de Excel. Recarga la página.');const model=buildReportModel(rows,catalogs,scope),zip=await Zip.loadAsync(template);
 const last=Math.max(6,model.records.length+5),detailCount=sum(model.records.map(r=>r.items.length)),detailLast=Math.max(6,detailCount+5);
 const g=c=>`Gestiones!$${c}$6:$${c}$${last}`,d=c=>`Detalle!$${c}$6:$${c}$${detailLast}`;
 const dataRows=[],detailRows=[];let detailRow=6;
 for(let i=0;i<model.records.length;i++){
  const r=model.records[i],n=i+6,[start,n2,n3,n4,finish]=r.times;
  const hoursFormula=(a,b)=>`IF(AND(ISNUMBER(${a}${n}),ISNUMBER(${b}${n})),MAX(0,(${b}${n}-${a}${n})*24),"")`;
  const flag=`IF(A${n}="",0,IF(AND(OR(Dashboard!$A$52="Todas",C${n}=Dashboard!$A$52),OR(Dashboard!$F$52="Todos",D${n}=Dashboard!$F$52),OR(Dashboard!$L$52="Todos",H${n}=Dashboard!$L$52),B${n}>=Dashboard!$R$52,B${n}<Dashboard!$V$52+1),1,0))`;
  dataRows.push([r.gestion,start,r.site,r.manager,r.cliente,String(r.factura??''),r.reason,r.estado,r.bodega_origen,r.bodega_destino,r.liquidadora||'',r.manager2,r.manager4,n2,n3,n4,finish,f(hoursFormula('B','N'),r.stages[0]),f(hoursFormula('N','O'),r.stages[1]),f(hoursFormula('O','P'),r.stages[2]),f(hoursFormula('B','P'),r.elapsed),f(`SUMIFS(${d('AC')},${d('A')},A${n})`,r.cost),f(`COUNTIFS(${d('A')},A${n})`,r.items.length),f(flag,1),f(`INT(B${n})`,r.day),r.comentario||'',r.gestor_n1===null?'':String(r.gestor_n1??''),f(`IF(AND(ISNUMBER(B${n}),ISNUMBER(P${n})),1,0)`,r.elapsed===null?0:1),f(`IF(X${n}=1,COUNTIFS($X$6:X${n},1),0)`,i+1)]);
  const responsible=r.estado==='Finalizada'?r.manager4:r.estado==='Enviado a Liquidacion'?r.liquidadora:r.estado==='Ingresada'?r.manager:(r.gestor_n4?r.manager4:r.gestor_n2?r.manager2:r.manager);
  for(const item of r.items){const q=detailRow++;detailRows.push([r.gestion,start,r.site,r.manager,r.manager2,r.manager4,r.liquidadora||'',String(r.factura??''),r.cliente,String(item.codigo),item.descripcion,item.quantity,r.reason,r.bodega_origen,r.bodega_destino,r.estado,n2,n3,n4,finish,...r.stages.map(v=>v===null?null:v),r.elapsed,responsible||'',r.comentario||'',r.items.length,item.unit,f(`ROUND(L${q}*AB${q},2)`,item.cost),f(`SUMIFS(${d('AC')},${d('A')},A${q})`,r.cost)])}
 }
 let dataXML=await zip.file('xl/worksheets/sheet3.xml').async('string');let detailXML=await zip.file('xl/worksheets/sheet4.xml').async('string');zip.file('xl/worksheets/sheet3.xml',replaceData(dataXML,dataRows,6));zip.file('xl/worksheets/sheet4.xml',replaceData(detailXML,detailRows,6));
 const cells=new Map(),put=(ref,value)=>cells.set(ref,value),metrics=model.metrics;
 put('B4',f(`SUM(${g('X')})`,metrics.count));put('B5',f(`IF(SUMIFS(${g('AB')},${g('X')},1)=0,"Sin completar",SUMIFS(${g('U')},${g('X')},1)/SUMIFS(${g('AB')},${g('X')},1))`,metrics.mean??'Sin completar'));
 put('B6',f(`COUNTIFS(${g('H')},"Finalizada",${g('X')},1)`,metrics.resolved));put('B7',f(`SUM(U4:U${Math.max(4,3+model.managers.length)})`,metrics.managers));put('B8',f(`SUMIFS(${g('V')},${g('X')},1)`,metrics.cost));put('B9',f('IF(B4=0,0,B6/B4)',metrics.ratio));put('B10',f(`COUNTIFS(${g('X')},1,${g('H')},"<>Finalizada",${g('H')},"<>Anulada")`,metrics.active));put('B11',f(`SUMIFS(${g('W')},${g('X')},1)`,metrics.lines));
 const stageCols=[['R',['N']],['S',['N','O']],['T',['O','P']]];
 stageCols.forEach(([c,dates],i)=>{const n=i+4;put('D'+n,['N1 a N2','N2 a N3','N3 a N4'][i]);const check=`COUNTIFS(${g('X')},1,${dates.map(x=>g(x)+',">0"').join(',')})`;put('F'+n,f(check,model.stages[i].count));put('E'+n,f(`IF(F${n}=0,"",SUMIFS(${g(c)},${g('X')},1)/F${n})`,model.stages[i].mean??''))});
 model.periods.forEach((p,i)=>{const n=i+4;put('H'+n,p.label);put('M'+n,p.start);put('N'+n,p.end);const crit=`${g('X')},1,${g('Y')},">="&M${n},${g('Y')},"<="&N${n}`;put('I'+n,f(`COUNTIFS(${crit})`,p.total));put('J'+n,f(`COUNTIFS(${crit},${g('H')},"Finalizada")`,p.resolved));put('K'+n,f(`COUNTIFS(${crit},${g('H')},"<>Finalizada",${g('H')},"<>Anulada")`,p.active));put('L'+n,f(`COUNTIFS(${crit},${g('H')},"Anulada")`,p.cancelled))});
 model.reasons.forEach((entry,i)=>{const n=i+4;put('P'+n,entry.label);put('Q'+n,f(`COUNTIFS(${g('G')},${quote('P'+n)},${g('X')},1)`,entry.count))});
 model.managers.forEach((entry,i)=>{const n=i+4;put('S'+n,entry.label);put('T'+n,f(`COUNTIFS(${g('D')},${quote('S'+n)},${g('X')},1)`,entry.count));put('U'+n,f(entry.label==='Sin gestor'?'0':`IF(T${n}>0,1,0)`,entry.label==='Sin gestor'?0:1))});
 for(const [group,from,valueFrom,to,valueTo] of [[model.topReasons,'P','Q','AD','AE'],[model.topManagers,'S','T','AG','AH']])group.forEach((entry,i)=>{const n=i+4,all=from==='P'?model.reasons:model.managers;put(to+n,entry.label);put(valueTo+n,f(entry.other?`SUM(${valueFrom}11:${valueFrom}${3+all.length})`:all.length?`${valueFrom}${entry.index+4}`:'0',entry.count))});
 for(const [c,values] of [['AA',model.siteList],['AB',model.managerList],['AC',model.stateList]])values.forEach((v,i)=>put(c+(i+2),v));
 let summary=await zip.file('xl/worksheets/sheet2.xml').async('string');const styles=rowStyles(summary,4);const body=summary.match(/<x:sheetData>([\s\S]*?)<\/x:sheetData>/)[1];const map=new Map();for(const match of body.matchAll(/<x:row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/x:row>/g)){const n=Number(match[1]);for(const cell of match[2].matchAll(/<x:c\b([^>]*?)(?:\/>|>[\s\S]*?<\/x:c>)/g)){const ref=cell[1].match(/\br="([A-Z]+\d+)"/)?.[1];if(ref)map.set(ref,cell[0]);}}
 // Clear the template's placeholder series and example list entries before filling.
 for(const ref of [...map.keys()]){const [,c,n]=ref.match(/^([A-Z]+)(\d+)$/);if(Number(n)>=4&&['H','I','J','K','L','M','N','P','Q','S','T','U','AD','AE','AG','AH'].includes(c)||Number(n)>=2&&['AA','AB','AC'].includes(c))map.delete(ref)}
 for(const [ref,value] of cells){const c=ref.match(/^[A-Z]+/)[0],existing=map.get(ref),style=existing?.match(/\bs="(\d+)"/)?.[1]||styles[c]||'0';map.set(ref,writeCell(ref,value,style))}
 const grouped=new Map();for(const [ref,raw] of map){const n=Number(ref.match(/\d+$/)[0]);if(!grouped.has(n))grouped.set(n,[]);grouped.get(n).push([ref.match(/^[A-Z]+/)[0],raw])}const cnum=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
 const sumData=[...grouped].sort((a,b)=>a[0]-b[0]).map(([n,entries])=>`<x:row r="${n}" ht="22" customHeight="1">${entries.sort((a,b)=>cnum(a[0])-cnum(b[0])).map(e=>e[1]).join('')}</x:row>`).join('');summary=summary.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/,`<x:sheetData>${sumData}</x:sheetData>`);zip.file('xl/worksheets/sheet2.xml',summary);
 let dashboard=await zip.file('xl/worksheets/sheet1.xml').async('string');const changes={A4:scope.description||'Operación de bodega y logística de café',A7:f('Resumen!B4',metrics.count),G7:f('Resumen!B5',metrics.mean??'Sin completar'),M7:f('Resumen!B6',metrics.resolved),S7:f('Resumen!B7',metrics.managers),A44:f('Resumen!B8',metrics.cost),G44:f('Resumen!B9',metrics.ratio),M44:f('Resumen!B10',metrics.active),S44:f('Resumen!B11',metrics.lines),A52:'Todas',F52:'Todos',L52:'Todos',R52:model.min,V52:model.max,A57:`Exportado ${new Intl.DateTimeFormat('es-HN',{dateStyle:'short',timeStyle:'short',timeZone:'America/Tegucigalpa'}).format(new Date())}`};
 const recent=[['A','A',r=>r.gestion],['D','C',r=>r.site],['F','E',r=>r.cliente],['K','G',r=>r.reason],['P','U',r=>r.elapsed]];
 for(let i=0;i<10;i++)for(const [anchor,column,value] of recent){const n=31+i;changes[anchor+n]=f(`IF(ROWS($A$31:A${n})>Resumen!$B$4,"",INDEX(${g(column)},MATCH(ROWS($A$31:A${n}),${g('AC')},0)))`,model.records[i]?value(model.records[i])??'':"")}
 dashboard=patchCells(dashboard,changes).replace(/Resumen!\$AA\$2:\$AA\$2/g,`Resumen!$AA$2:$AA$${model.siteList.length+1}`).replace(/Resumen!\$AB\$2:\$AB\$2/g,`Resumen!$AB$2:$AB$${model.managerList.length+1}`).replace(/Resumen!\$AC\$2:\$AC\$2/g,`Resumen!$AC$2:$AC$${model.stateList.length+1}`);
 // Extend the template's existing properties: a second sheetPr makes Excel discard this sheet.
 dashboard=dashboard.replace('</x:sheetPr>','<x:pageSetUpPr fitToPage="1"/></x:sheetPr>').replace('<x:drawing ', '<x:pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/><x:drawing ');zip.file('xl/worksheets/sheet1.xml',dashboard);
 for(const [name,end] of [['table1.xml','AC'+last],['table2.xml','AD'+detailLast]]){const path='xl/tables/'+name;let content=await zip.file(path).async('string');content=content.replace(/showRowStripes="1"/g,'showRowStripes="0"');content=content.replace(/ref="A5:[A-Z]+6"/g,`ref="A5:${end}"`);if(!content.includes('<x:autoFilter'))content=content.replace('<x:tableColumns',`<x:autoFilter ref="A5:${end}"/><x:tableColumns`);zip.file(path,content)}
 const charts=Object.keys(zip.files).filter(path=>/^xl\/drawings\/charts\/chart\d+\.xml$/.test(path));for(const path of charts){const index=Number(path.match(/chart(\d+)\.xml$/)[1]);zip.file(path,updateChart(await zip.file(path).async('string'),cells,model,index))}
 let book=await zip.file('xl/workbook.xml').async('string');book=book.replace('</x:workbook>','<x:definedNames><x:definedName name="_xlnm.Print_Area" localSheetId="0">Dashboard!$A$1:$X$57</x:definedName></x:definedNames><x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></x:workbook>');zip.file('xl/workbook.xml',book);
 return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}}),model};
}

export async function downloadDashboard(rows,catalogs,scope={}){
 const response=await fetch(new URL('./reports/dashboard-template.xlsx?v=20261021-dashboard',import.meta.url),{cache:'no-cache'});if(!response.ok)throw new Error('No se pudo cargar la plantilla del dashboard. Intenta nuevamente.');
 const {bytes,model}=await createDashboardXlsx({rows,catalogs,scope,template:await response.arrayBuffer()});const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`Dashboard_Devoluciones_BIA_${new Date().toLocaleDateString('en-CA',{timeZone:'America/Tegucigalpa'})}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return model.metrics.count;
}
