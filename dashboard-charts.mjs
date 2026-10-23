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
export function monthlyAverages(rows,month=''){
 const months=month?[month]:availableMonths(rows).reverse();
 return months.map(key=>{const [year,m]=key.split('-').map(Number),days=new Date(Date.UTC(year,m,0)).getUTCDate(),count=rows.filter(row=>monthOf(row)===key).length;return {month:key,days,count,average:count/days}});
}
const decimal=value=>new Intl.NumberFormat('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
export function dailyChart(rows,month=''){
 const entries=monthlyAverages(rows,month);if(!entries.length)return '<p class="empty">No hay devoluciones en esta selección.</p>';
 const max=Math.max(...entries.map(e=>e.average),1);
 return `<div class="monthly-averages" role="group" aria-label="Promedio diario de devoluciones por mes">${entries.map(e=>`<div class="bar-row"><div class="bar-label"><span>${escape(monthLabel(e.month))}</span><strong>${decimal(e.average)} <small>gestiones por día</small></strong></div><div class="bar-track"><div class="bar-fill" style="width:${e.average/max*100}%"></div></div><p class="muted">${e.count} gestiones ÷ ${e.days} días calendario</p></div>`).join('')}</div><p class="muted">Promedio diario por mes. Se incluyen los días sin registros. Los demás filtros limitan las gestiones del cálculo.</p>`;
}
const palette=['#3268af','#62a19b','#c79a48','#8d7db0','#da8b79','#8398af','#b8aa89','#668a51'];
export function motiveChart(entries){
 entries=entries.filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);if(!entries.length)return '<p class="empty">No hay devoluciones en esta selección.</p>';
 // Keep every motive in the legend; slices repeat the accessible palette when necessary.
 const total=entries.reduce((s,[,n])=>s+n,0);let offset=0;
 const slices=entries.map(([label,n],i)=>{const size=n/total*100,html=`<circle cx="70" cy="70" r="52" pathLength="100" fill="none" stroke="${palette[i%palette.length]}" stroke-width="24" stroke-dasharray="${size} ${100-size}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"><title>${escape(label)}: ${size.toFixed(1)}% · ${n} gestiones</title></circle>`;offset+=size;return html}).join('');
 return `<div class="motive-chart"><svg viewBox="0 0 140 140" role="img" aria-label="Distribución por motivo de devolución">${slices}<text x="70" y="69" text-anchor="middle" class="donut-total">${total}</text><text x="70" y="84" text-anchor="middle">gestiones</text></svg><ul class="chart-legend">${entries.map(([label,n],i)=>`<li><i style="background:${palette[i%palette.length]}"></i><span>${escape(label)}</span><strong>${(n/total*100).toFixed(1)}% <small>· ${n} gestiones</small></strong></li>`).join('')}</ul></div>`;
}
