import {localDay} from './logic.mjs?v=20261021-estados';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const monthOf=row=>localDay(row.fecha_registro).slice(0,7);
export function availableMonths(rows){return [...new Set(rows.map(monthOf))].sort().reverse()}
export function monthLabel(month){return new Intl.DateTimeFormat('es-HN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-15T12:00:00Z`))}
export function dailyCounts(rows,month=''){
 const counts=new Map();for(const row of rows){const day=localDay(row.fecha_registro);if(!month||day.startsWith(month+'-'))counts.set(day,(counts.get(day)||0)+1)}
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){const [year,m]=month.split('-').map(Number),days=new Date(Date.UTC(year,m,0)).getUTCDate();for(let d=1;d<=days;d++){const key=`${month}-${String(d).padStart(2,'0')}`;if(!counts.has(key))counts.set(key,0)}}
 return [...counts].sort(([a],[b])=>a.localeCompare(b));
}
export function destinationOf(row){const value=String(row.bodega_destino??'').trim();return /^\d{1,3}$/.test(value)?value.padStart(3,'0'):value||'Sin destino'}
export function dayOf(row){const raw=row.devoluciones_detalle?.[0]?.datos_originales?.DIA;const day=Number(raw);return Number.isInteger(day)&&day>=1&&day<=31?day:Number(localDay(row.fecha_registro).slice(-2))}
export const stateOf=row=>String(row.estado||'Sin estado').trim()||'Sin estado';
function seriesColor(state,destination){if(state==='Finalizada'&&destination==='030')return '#156184';if(state==='Finalizada'&&destination==='095')return '#f47735';let hash=0;for(const c of JSON.stringify([state,destination]))hash=(hash*31+c.charCodeAt(0))>>>0;return `hsl(${hash%360} 55% 40%)`}
export function dailySeries(rows,month='',filters={}){
 const selected=rows.filter(row=>(!month||monthOf(row)===month)&&(!filters.day||dayOf(row)===Number(filters.day))&&(!filters.state||stateOf(row)===filters.state)&&(!filters.destination||destinationOf(row)===filters.destination));
 const series=new Map();for(const row of selected){const state=stateOf(row),destination=destinationOf(row),key=JSON.stringify([state,destination]);if(!series.has(key))series.set(key,{state,destination,label:`${state} (Bodega ${destination})`,color:seriesColor(state,destination),values:Array(31).fill(0),total:0});const item=series.get(key);item.values[dayOf(row)-1]++;item.total++}
 return {count:selected.length,series:[...series.values()].sort((a,b)=>(a.state==='Finalizada'?0:1)-(b.state==='Finalizada'?0:1)||a.state.localeCompare(b.state,'es')||a.destination.localeCompare(b.destination,'es',{numeric:true}))};
}
export function dailyChart(rows,month='',filters={}){
 const {series,count}=dailySeries(rows,month,filters),slot=Math.max(32,series.length*6+8),width=Math.max(1050,31*slot+65),plot=210,base=245;
 const max=Math.max(1,...Array.from({length:31},(_,d)=>Math.max(0,...series.map(s=>s.values[d])))),tick=Math.max(1,Math.ceil(max/5)),ceiling=tick*5;
 const grid=Array.from({length:6},(_,i)=>{const value=tick*i,y=base-value/ceiling*plot;return `<line x1="45" y1="${y}" x2="${width-10}" y2="${y}" stroke="#e4eaf1"/><text x="35" y="${y+4}" text-anchor="end">${value}</text>`}).join('');
 const step=(width-65)/31,barWidth=Math.min(18,(step-8)/Math.max(series.length,1));
 const bars=Array.from({length:31},(_,d)=>{const center=45+step*(d+.5);return series.map((s,i)=>{const value=s.values[d],height=value/ceiling*plot;if(!value)return '';return `<rect x="${center-series.length*barWidth/2+i*barWidth}" y="${base-height}" width="${Math.max(1,barWidth-1)}" height="${height}" fill="${s.color}" rx="1"><title>Día ${d+1} · ${escape(s.label)}: ${value} gestiones</title></rect>`}).join('')+`<text x="${center}" y="267" text-anchor="middle">${d+1}</text>`}).join('');
 const legend=series.map(s=>`<li><i style="background:${s.color}"></i><span>${escape(s.label)}</span><strong>${s.total}</strong></li>`).join('');
 return `<ul class="daily-legend" aria-label="Estado y Bodega Destino">${legend}</ul><div class="daily-chart"><svg role="img" aria-label="Cantidad de gestiones por día, Estado y Bodega Destino" viewBox="0 0 ${width} 290" style="min-width:${width}px">${grid}${bars}<text x="${width/2}" y="287" text-anchor="middle">DÍA</text></svg></div>${count?'':'<p class="empty">No hay devoluciones en esta selección.</p>'}`;
}
const palette=['#3268af','#62a19b','#c79a48','#8d7db0','#da8b79','#8398af','#b8aa89','#668a51'];
export function motiveChart(entries){
 entries=entries.filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);if(!entries.length)return '<p class="empty">No hay devoluciones en esta selección.</p>';
 // Keep every motive in the legend; slices repeat the accessible palette when necessary.
 const total=entries.reduce((s,[,n])=>s+n,0);let offset=0;
 const slices=entries.map(([label,n],i)=>{const size=n/total*100,html=`<circle cx="70" cy="70" r="52" pathLength="100" fill="none" stroke="${palette[i%palette.length]}" stroke-width="24" stroke-dasharray="${size} ${100-size}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"><title>${escape(label)}: ${size.toFixed(1)}% · ${n} gestiones</title></circle>`;offset+=size;return html}).join('');
 return `<div class="motive-chart"><svg viewBox="0 0 140 140" role="img" aria-label="Distribución por motivo de devolución">${slices}<text x="70" y="69" text-anchor="middle" class="donut-total">${total}</text><text x="70" y="84" text-anchor="middle">gestiones</text></svg><ul class="chart-legend">${entries.map(([label,n],i)=>`<li><i style="background:${palette[i%palette.length]}"></i><span>${escape(label)}</span><strong>${(n/total*100).toFixed(1)}% <small>· ${n} gestiones</small></strong></li>`).join('')}</ul></div>`;
}
