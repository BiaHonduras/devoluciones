export const STATES=['Ingresada','Enviado a Liquidacion','Nota de Débito Entregada','Finalizada','Anulada'];
export const NEXT={'Ingresada':'Enviado a Liquidacion','Enviado a Liquidacion':'Nota de Débito Entregada','Nota de Débito Entregada':'Finalizada'};
const key=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const legacy={'nivel 1 ingresado':'Ingresada','pendiente liquidadora':'Enviado a Liquidacion','nota debito liquidadora':'Nota de Débito Entregada','pendiente gp':'Nota de Débito Entregada','finalizado':'Finalizada','anulado':'Anulada'};
// Historical files keep their original Estado in datos_originales. Only the
// operational value is converted to the current catalog before validation.
export function canonicalState(value,row={}){const k=key(value);if(k==='atrasado')return row.fecha_finalizado?'Finalizada':row.fecha_nota_debito||row.fecha_ingreso_gp?'Nota de Débito Entregada':row.fecha_entrega_liquidadora?'Enviado a Liquidacion':'Ingresada';return STATES.find(s=>key(s)===k)||legacy[k]||value;}
