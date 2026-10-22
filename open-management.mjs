const stages={
 Ingresada:{step:'Tomar gestión N2',date:'fecha_registro'},
 'Enviado a Liquidacion':{step:'Confirmar entrega de Notas de Débito',date:'fecha_entrega_liquidadora'},
 'Nota de Débito Entregada':{step:'Confirmar ingreso a Bodega Destino',date:'fecha_nota_debito'}
};
export const isOpenManagement=row=>!row.eliminado_at&&Object.hasOwn(stages,row.estado);
export function followupFor(row,now=Date.now()){
 if(!isOpenManagement(row))return null;const stage=stages[row.estado],since=row[stage.date]||row.fecha_registro||null,time=since?new Date(since).getTime():NaN;
 return {step:stage.step,since,hours:Number.isFinite(time)?Math.max(0,(Number(now)-time)/3600000):null};
}
export function openManagements(rows){return rows.filter(isOpenManagement).slice().sort((a,b)=>{const x=Date.parse(followupFor(a).since),y=Date.parse(followupFor(b).since);return (Number.isFinite(x)?x:Infinity)-(Number.isFinite(y)?y:Infinity)||String(a.gestion).localeCompare(String(b.gestion));});}
