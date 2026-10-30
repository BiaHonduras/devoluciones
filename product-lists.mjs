// A stable order keeps the five displayed product lists aligned after reloads.
export function orderedProducts(items=[]){return items.map((item,index)=>({item,index})).sort((a,b)=>{
 const x=a.item.datos_originales,y=b.item.datos_originales;
 if(Number.isInteger(x?.fila_origen)&&Number.isInteger(y?.fila_origen)){
  if(x.fila_origen!==y.fila_origen)return x.fila_origen-y.fila_origen;
  if(Number.isInteger(x.producto?.indice)&&Number.isInteger(y.producto?.indice)&&x.producto.indice!==y.producto.indice)return x.producto.indice-y.producto.indice;
 }
 return a.item.id!=null&&b.item.id!=null?String(a.item.id).localeCompare(String(b.item.id),'en',{numeric:true}):a.index-b.index;
 }).map(x=>x.item);}

export function boxesForProduct(item){return item.datos_originales?.producto?.cajas_fardos??item.datos_originales?.['Cajas/Fardos']??'';}
export function totalBoxes(items=[]){const values=items.map(boxesForProduct);if(values.some(v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0))return '';return values.reduce((sum,v)=>sum+Number(v),0);}
export function joinProducts(values){return values.map(v=>{const s=String(v??'').trim()||'—';return /[,"\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(', ');}
export function groupedProducts(items=[]){const ordered=orderedProducts(items),get=key=>joinProducts(ordered.map(i=>i[key]));return {codigo:get('codigo'),descripcion:get('descripcion'),cantidad:joinProducts(ordered.map(i=>Number(i.cantidad))),costo_unitario:joinProducts(ordered.map(i=>Number(i.costo_unitario))),costo_total:joinProducts(ordered.map(i=>Number(i.costo_total))),cajas_fardos:totalBoxes(ordered)};}
