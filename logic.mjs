export {NEXT} from './statuses.mjs';
export const money=n=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(Number(n)||0);
export const number=n=>new Intl.NumberFormat('es-HN',{maximumFractionDigits:4}).format(Number(n)||0);
export const localDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tegucigalpa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function hours(a,b){return a&&b?Math.max(0,(new Date(b)-new Date(a))/3600000):null}
export function summarize(rows){
 const completed=rows.filter(r=>r.estado==='Finalizada');
 const elapsed=rows.map(r=>hours(r.fecha_registro,r.fecha_ingreso_gp)).filter(x=>x!==null);
 return {count:rows.length,resolved:completed.length,managers:new Set(rows.map(r=>r.gestor_n1)).size,mean:elapsed.length?elapsed.reduce((a,b)=>a+b,0)/elapsed.length:null,total:rows.flatMap(r=>r.devoluciones_detalle||[]).reduce((s,i)=>s+Number(i.costo_total),0)};
}
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
export function filterRows(rows,f,names){return rows.filter(r=>{
 const day=localDay(r.fecha_registro);
 if(f.from&&day<f.from||f.to&&day>f.to||f.sede&&r.sede!==f.sede||f.estado&&r.estado!==f.estado||f.gestor&&String(r.gestor_n1)!==f.gestor)return false;
 const hay=[r.gestion,r.factura,r.cliente,r.observacion,r.comentario,names[r.gestor_n1],...(r.devoluciones_detalle||[]).flatMap(i=>[i.codigo,i.descripcion])].join(' ').toLocaleLowerCase('es');
 return !f.text||hay.includes(f.text.toLocaleLowerCase('es'));
})}

