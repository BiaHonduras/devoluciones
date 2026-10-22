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
export function dailyChart(rows,month=''){
 const entries=dailyCounts(rows,month);if(!entries.length)return '<p class="empty">No hay devoluciones en esta selección.</p>';
 const max=Math.max(1,...entries.map(([,n])=>n)),step=34,width=Math.max(720,entries.length*step+70),height=260,plot=190;
 const grid=Array.from({length:5},(_,i)=>{const n=Math.ceil(max/4)*i,y=220-n/(Math.ceil(max/4)*4)*plot;return `<line x1="40" y1="${y}" x2="${width-10}" y2="${y}" stroke="#e4eaf1"/><text x="30" y="${y+4}" text-anchor="end">${n}</text>`}).join('');
 const ceiling=Math.ceil(max/4)*4;
 const bars=entries.map(([day,n],i)=>{const x=50+i*((width-65)/entries.length),w=Math.min(24,(width-65)/entries.length-6),h=n/ceiling*plot;return `<g><title>${escape(day)}: ${n} devoluciones</title><rect x="${x}" y="${220-h}" width="${w}" height="${h}" rx="3" fill="#3268af"/><text x="${x+w/2}" y="${Math.max(20,214-h)}" text-anchor="middle">${n||''}</text><text x="${x+w/2}" y="242" text-anchor="middle">${month?day.slice(-2):day.slice(5)}</text></g>`}).join('');
 return `<div class="daily-chart"><svg role="img" aria-label="Cantidad de devoluciones por día" viewBox="0 0 ${width} ${height}" style="min-width:${width}px">${grid}${bars}</svg></div><p class="muted">${month?'Día del mes':'Fecha (mes-día)'} · ${rows.length} gestiones · Hora de Honduras</p><details><summary>Ver datos por día</summary><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Devoluciones</th></tr></thead><tbody>${entries.map(([d,n])=>`<tr><td>${d}</td><td>${n}</td></tr>`).join('')}</tbody></table></div></details>`;
}
const palette=['#3268af','#62a19b','#c79a48','#8d7db0','#da8b79','#8398af','#b8aa89','#668a51'];
export function motiveChart(entries){
 entries=entries.filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);if(!entries.length)return '<p class="empty">No hay devoluciones en esta selección.</p>';
 // Keep every motive in the legend; slices repeat the accessible palette when necessary.
 const total=entries.reduce((s,[,n])=>s+n,0);let offset=0;
 const slices=entries.map(([label,n],i)=>{const size=n/total*100,html=`<circle cx="70" cy="70" r="52" pathLength="100" fill="none" stroke="${palette[i%palette.length]}" stroke-width="24" stroke-dasharray="${size} ${100-size}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"><title>${escape(label)}: ${n}</title></circle>`;offset+=size;return html}).join('');
 return `<div class="motive-chart"><svg viewBox="0 0 140 140" role="img" aria-label="Distribución por motivo de devolución">${slices}<text x="70" y="69" text-anchor="middle" class="donut-total">${total}</text><text x="70" y="84" text-anchor="middle">gestiones</text></svg><ul class="chart-legend">${entries.map(([label,n],i)=>`<li><i style="background:${palette[i%palette.length]}"></i><span>${escape(label)}</span><strong>${n} <small>(${(n/total*100).toFixed(1)}%)</small></strong></li>`).join('')}</ul></div>`;
}
