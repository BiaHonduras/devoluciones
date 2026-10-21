import {importNumber} from './import-number.mjs';
import {canonicalState} from './statuses.mjs';
import {FIELDS,validateRows} from './transfer.mjs?v=20261021-precision';
export const ORIGINAL_HEADERS=['ID Gestion','FechaRegistro','Sede','GestorN1','GestorN2','GestorN4','Liquidadora','NumeroFactura','NombreCliente','Codigo','Descripcion','Cantidad','Observacion','BodegaOrigen','BodegaDestino','Estado','FechaEntregaLiquidadora','FechaNotaDebido','FechaIngresoGP','TiempoN1N2','TiempoN2N3','TiempoN3N4','TiempoTotal','ResponsableActual','Comentarios','ConteoSKUs','CostoSKU','CostoTotal','DIA','Cajas/Fardos','Mes'];
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const header=v=>norm(v)==='fechanotadebito'?'fechanotadebido':norm(v);
function tsv(text){const rows=[];let row=[],cell='',quoted=false,closed=false;text=text.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;}else if(c==='"'&&!cell&&!closed)quoted=true;else if(c==='\t'||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!=='\t'){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[]}}else{if(closed&&c.trim())throw Error('Revisa las comillas del contenido pegado.');if(!closed)cell+=c;}}if(quoted)throw Error('Hay una celda con comillas sin cerrar. Copia nuevamente el rango desde Excel.');if(cell||row.length){row.push(cell);if(row.some(v=>v.trim()))rows.push(row)}return rows;}
export function originalNumber(value){let s=String(value).trim().replace(/^(?:HNL|L\.?)\s*/i,'').replace(/[\s\u00a0]/g,'');if(!s)return '';if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}else if(s.includes(',')){s=/^\d{1,3}(,\d{3})+$/.test(s)?s.replace(/,/g,''):s.replace(',','.');}return importNumber(s);}
export function originalDate(value){const s=String(value??'').trim();if(!s||['-','—'].includes(s))return '';if(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s)){if(!Number.isFinite(Date.parse(s)))throw Error('fecha inválida.');return new Date(s).toISOString();}
 let year,month,day,h=0,m=0,sec=0;
 if(/^\d{5}(?:\.\d+)?$/.test(s)){const ms=(Number(s)-25569)*86400000;const dt=new Date(Math.round(ms/1000)*1000);year=dt.getUTCFullYear();month=dt.getUTCMonth()+1;day=dt.getUTCDate();h=dt.getUTCHours();m=dt.getUTCMinutes();sec=dt.getUTCSeconds();}
 else{const match=s.match(/^(?:(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})|(\d{4})-(\d{2})-(\d{2}))(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?)?$/i);if(!match)throw Error('usa día/mes/año, con hora opcional (por ejemplo 21/10/2026 14:30).');year=+(match[3]||match[4]);month=+(match[2]||match[5]);day=+(match[1]||match[6]);h=+(match[7]||0);m=+(match[8]||0);sec=+(match[9]||0);if(match[10]){if(h<1||h>12)throw Error('hora inválida.');h=h%12+(/p/i.test(match[10])?12:0);}}
 const check=new Date(Date.UTC(year,month-1,day));if(year<1900||year>2200||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||h>23||m>59||sec>59)throw Error('fecha u hora inválida.');return new Date(Date.UTC(year,month-1,day,h+6,m,sec)).toISOString();}
function unique(value,list,keys,label){const match=list.filter(x=>keys.some(k=>norm(x[k])===norm(value)));if(match.length!==1)throw Error(`${label} «${value}» ${match.length?'es ambiguo; utiliza el correo o código':'no existe en tu catálogo autorizado'}.`);return match[0];}
// Commas delimit products. Quote an individual description when it contains a comma.
export function splitProducts(value){const out=[];let cell='',quoted=false,closed=false;for(let i=0;i<String(value).length;i++){const c=String(value)[i];if(quoted){if(c==='"'){if(String(value)[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;}else if(c==='"'&&!cell.trim()&&!closed){quoted=true;cell='';}else if(c===','){out.push(cell.trim());cell='';closed=false;}else if(closed){if(c.trim())throw Error('Revisa las comillas de la lista de productos.');}else cell+=c;}if(quoted)throw Error('Hay comillas sin cerrar en la lista de productos.');out.push(cell.trim());return out;}
export function parseExcelPaste(text,catalog){if(new TextEncoder().encode(text).length>15*1024*1024)throw Error('El contenido supera 15 MB.');return parseExcelRows(tsv(text),catalog);}
export function parseExcelRows(input,catalog){let matrix=input.map(row=>row.map(v=>String(v??'')));if(!matrix.length)throw Error('Copia las filas de Excel y pégalas en el recuadro.');const keys=ORIGINAL_HEADERS.map(header),isHeader=matrix[0].filter(v=>keys.includes(header(v))).length>=2;let order=keys,first=1;if(isHeader){order=matrix.shift().map(header);first=2;if(order.length!==keys.length||new Set(order).size!==keys.length||keys.some(k=>!order.includes(k)))throw Error('Incluye las 31 columnas del archivo original, sin repetir encabezados. Se acepta FechaNotaDebido o FechaNotaDebito.');}if(!matrix.length||matrix.length>10000)throw Error('Se requieren entre 1 y 10,000 filas de origen.');const originals=[],rows=[],origins=[];
 for(const [i,cells] of matrix.entries()){
 const fail=(label,e)=>{throw Error(`Fila ${i+first}, ${label}: ${e.message||e}`)};
 if(cells.length!==31)fail('columnas',`se esperaban 31 y se encontraron ${cells.length}. Copia desde ID Gestion hasta Mes, incluidas las celdas vacías.`);
 const original=Object.fromEntries(ORIGINAL_HEADERS.map(h=>[h,cells[order.indexOf(header(h))].trim()]));originals.push(original);
 const base=Object.fromEntries(FIELDS.map(k=>[k,'']));const map={gestion:'ID Gestion',fecha_registro:'FechaRegistro',sede:'Sede',gestor_n1:'GestorN1',gestor_n2:'GestorN2',gestor_n4:'GestorN4',liquidadora:'Liquidadora',factura:'NumeroFactura',cliente:'NombreCliente',codigo:'Codigo',descripcion:'Descripcion',cantidad:'Cantidad',costo_unitario:'CostoSKU',observacion:'Observacion',bodega_origen:'BodegaOrigen',bodega_destino:'BodegaDestino',estado:'Estado',fecha_entrega_liquidadora:'FechaEntregaLiquidadora',fecha_nota_debito:'FechaNotaDebido',fecha_ingreso_gp:'FechaIngresoGP',comentario:'Comentarios'};
 for(const [k,h] of Object.entries(map))base[k]=original[h];base.gestion=base.gestion.toUpperCase();
 for(const k of FIELDS.filter(k=>k.startsWith('fecha_')))try{base[k]=originalDate(base[k])}catch(e){fail(map[k]||k,e)}
 base.estado=canonicalState(base.estado,base);
 try{base.sede=unique(base.sede,catalog.sedes,['codigo','nombre'],'Sede').codigo;for(const k of ['gestor_n1','gestor_n2','gestor_n4'])if(base[k]){const u=unique(base[k],catalog.usuarios,['correo','nombre_corto','usuario','id'],map[k]);if(!u.correo)throw Error(`${map[k]} no tiene correo configurado.`);base[k]=u.correo.toLowerCase();}for(const [k,list] of [['cliente','negocio'],['observacion','observaciones'],['estado','estados'],['liquidadora','liquidadoras']])if(base[k])base[k]=unique(base[k],catalog[list].map(value=>({value})),['value'],map[k]).value;}catch(e){fail('catálogos',e)}
 let codes;try{codes=splitProducts(original.Codigo)}catch(e){fail('Codigo',e)}const count=codes.length;if(count>200)fail('Codigo','Máximo 200 productos por gestión.');if(codes.some(c=>!c))fail('Codigo','Hay un código vacío entre las comas.');
 const lists={Codigo:codes};for(const field of ['Descripcion','Cantidad','CostoSKU','Cajas/Fardos']){
  if(count===1)lists[field]=[original[field]];
  else if(!original[field]&&['Descripcion','Cajas/Fardos'].includes(field))lists[field]=Array(count).fill('');
  else{try{lists[field]=splitProducts(original[field])}catch(e){fail(field,e)}if(lists[field].length!==count)fail(field,`hay ${lists[field].length} valores para ${count} códigos. Las listas deben tener el mismo orden y cantidad. Usa punto decimal y no uses separador de miles en las listas.`);}
 }
 let rowCost=0;
 for(let j=0;j<count;j++){
  const r={...base,codigo:codes[j],descripcion:lists.Descripcion[j]};
  for(const [k,h] of [['cantidad','Cantidad'],['costo_unitario','CostoSKU']])try{const raw=lists[h][j];if(count>1&&!/^(?:HNL|L\.?)?\s*\d+(?:\.\d+)?$/i.test(raw))throw Error('usa punto decimal y no uses separador de miles en las listas.');r[k]=originalNumber(raw);}catch(e){fail(`${h}, SKU ${j+1}`,e)}
  rowCost+=Math.round(Number(r.cantidad)*Number(r.costo_unitario)*100)/100;
  r.datos_originales={...original,producto:{indice:j+1,codigo:r.codigo,descripcion:r.descripcion,cantidad:r.cantidad,costo_sku:r.costo_unitario,cajas_fardos:lists['Cajas/Fardos'][j]},fila_origen:i+first};
  rows.push(r);origins.push({row:i+first,sku:j+1});if(rows.length>10000)fail('productos','Máximo 10,000 productos en una importación.');
 }
 if(original.CostoTotal)try{const total=Number(originalNumber(original.CostoTotal));if(Math.abs(rowCost-total)>0.011)throw Error('no coincide con la suma de Cantidad × CostoSKU de los productos de esta fila.');}catch(e){fail('CostoTotal',e)}
 }
 try{validateRows(rows,catalog)}catch(e){throw Error(e.message.replace(/^Fila (\d+):/,(_,n)=>{const source=origins[Number(n)-2];return `Fila ${source?.row??n}, SKU ${source?.sku??1}:`;}));}
 return {rows,originals,hasHeaders:isHeader};
}
