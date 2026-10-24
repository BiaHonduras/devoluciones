import {dailySeries,availableMonths,dayOf,monthOf,destinationOf} from './dashboard-charts.mjs?v=20261023-botones';
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const literal=v=>'"'+String(v).replace(/"/g,'""')+'"';
const criterion=v=>literal('='+String(v).replace(/~/g,'~~').replace(/\*/g,'~*').replace(/\?/g,'~?'));
const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export function dailyReportModel(rows){const series=dailySeries(rows).series;return {series:series.length?series:[{label:'Sin registros',state:'',destination:'',color:'#345A40',values:Array(31).fill(0),total:0}],months:['Todos los meses',...availableMonths(rows)],destinations:['Todas las bodegas',...[...new Set(rows.map(destinationOf))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}))]};}
export const dailyRecordValues=row=>[monthOf(row),dayOf(row),destinationOf(row)];
export function fillDailyCells(model,put,g,formula){
 const daily=model.daily,last=Math.max(6,model.records.length+5),range=c=>`Resumen!$${c}$6:$${c}$${last}`;
 daily.months.forEach((v,i)=>put('BP'+(i+2),v));daily.destinations.forEach((v,i)=>put('BQ'+(i+2),v));put('BR3','DÍA');
 for(let d=1;d<=31;d++)put('BR'+(d+3),d);
 daily.series.forEach((series,i)=>{const c=column(70+i);put(c+'3',series.label);for(let d=1;d<=31;d++){
  const selected=`AND(OR(Dashboard!$F$11="Todos",Dashboard!$F$11=${literal(series.state)}),OR(Dashboard!$K$11="Todas las bodegas",Dashboard!$K$11=${literal(series.destination)}))`;
  const count=`COUNTIFS(${g('X')},1,${g('H')},${criterion(series.state)},${range('BO')},${criterion(series.destination)},${range('BN')},BR${d+3},${range('BM')},IF(Dashboard!$A$11="Todos los meses","*",Dashboard!$A$11))`;
  put(c+(d+3),formula(`IF(${selected},${count},0)`,series.values[d-1]));
 }});
}
export function chartLabels({percent=false,rotated=false,position='t',format='0'}={}){
 return `<c:dLbls><c:numFmt formatCode="${escape(format)}" sourceLinked="0"/><c:txPr><a:bodyPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"${rotated?' rot="-5400000"':''}/><a:lstStyle xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:pPr><a:defRPr sz="700"/></a:pPr><a:endParaRPr lang="es-HN"/></a:p></c:txPr><c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="${percent?0:1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${percent?1:0}"/><c:showBubbleSize val="0"/></c:dLbls>`;
}
function color(value){if(value.startsWith('#'))return value.slice(1).toUpperCase();const h=Number(value.match(/hsl\((\d+)/)?.[1]||0)/60,s=.55,l=.4,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),m=l-c/2;const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];return rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();}
export function dailyChartXml(text,model){
 const old=text.match(/<c:lineChart>[\s\S]*?<\/c:lineChart>/)?.[0];if(!old)throw Error('Falta el gráfico diario en la plantilla.');
 const axes=[...old.matchAll(/<c:axId\b[^>]*\/>/g)].map(m=>m[0]).join('');
 const series=model.daily.series.length?model.daily.series:[{label:'Sin registros',color:'#345A40'}];
 const data=series.map((s,i)=>`<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${escape(s.label)}</c:v></c:tx><c:spPr><a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:srgbClr val="${color(s.color)}"/></a:solidFill></c:spPr>${chartLabels({rotated:true,position:'outEnd',format:'0;-0;;'})}<c:cat><c:strRef><c:f>Resumen!$BR$4:$BR$34</c:f><c:strCache/></c:strRef></c:cat><c:val><c:numRef><c:f>Resumen!$${column(70+i)}$4:$${column(70+i)}$34</c:f><c:numCache/></c:numRef></c:val></c:ser>`).join('');
 return text.replace(old,`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${data}<c:gapWidth val="60"/><c:overlap val="0"/>${axes}</c:barChart>`).replace('Devoluciones por período','Devoluciones por Día').replace(/<c:tickLblSkip[^>]*\/>/g,'<c:tickLblSkip val="1"/>');
}
