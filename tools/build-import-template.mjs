import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const Zip=require('../vendor/jszip.min.js');
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
import {ORIGINAL_HEADERS} from '../paste-import.mjs';
import {STATES} from '../statuses.mjs';
const wb=Workbook.create(),sheet=wb.worksheets.add('Importar'),help=wb.worksheets.add('Instrucciones');
const green='#345A40',cream='#F5F1E8',ink='#34251F';
sheet.showGridLines=false;sheet.tabColor=green;sheet.getRange('A1:AE201').format={font:{name:'Arial',size:10,color:ink},columnWidth:22,rowHeight:24,verticalAlignment:'center'};
sheet.getRange('A1:AE1').values=[ORIGINAL_HEADERS];sheet.getRange('A1:AE1').format={fill:green,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:42,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};
sheet.getRange('A2:AE201').format.fill='#FFFFFF';
for(const c of ['A','D','E','F','H','J','K','L','AA','AD'])sheet.getRange(`${c}2:${c}201`).setNumberFormat('@');
for(const c of ['B','Q','R','S'])sheet.getRange(`${c}2:${c}201`).setNumberFormat('dd/mm/yyyy hh:mm');
sheet.getRange('AB2:AB201').setNumberFormat('0.00');sheet.getRange('P2:P201').dataValidation={rule:{type:'list',values:STATES}};
for(const c of ['J','K','L','AA','AD']){sheet.getRange(`${c}1`).format.fill='#866649';sheet.getRange(`${c}2:${c}201`).format.fill=cream;sheet.getRange(`${c}1:${c}201`).format.columnWidth=c==='K'?44:28;}
sheet.getRange('I1:I201').format.columnWidth=32;sheet.getRange('Y1:Y201').format.columnWidth=42;sheet.freezePanes.freezeRows(1);sheet.freezePanes.freezeColumns(2);
help.showGridLines=false;help.getRange('A1:B23').format={font:{name:'Arial',size:11,color:ink},rowHeight:25,verticalAlignment:'center'};help.getRange('A1:A23').format.columnWidth=32;help.getRange('B1:B23').format.columnWidth=102;
help.getRange('A1').values=[['Importar devoluciones']];help.getRange('A1').format.font={name:'Arial',size:15,bold:true,color:green};
const instructions=[['1. Completar','Pega los registros en Importar, desde la fila 2. Conserva las 31 columnas y sus encabezados.'],['2. Una fila por gestión','Cada devolución puede contener varios SKU en las cinco columnas sombreadas.'],['3. Guardar y cargar','Guarda como .xlsx y selecciona el archivo en Importar | Exportar de la página.'],['4. Validar e importar','Pulsa Validar y ver vista previa. Revisa el resultado y pulsa Importar histórico.']];help.getRange('A3:B6').values=instructions;help.getRange('A3:A6').format.font={name:'Arial',size:11,bold:true,color:green};
help.getRange('A8:B8').values=[['Columna de productos','Ejemplo con dos SKU (datos ficticios)']];help.getRange('A8:B8').format={fill:green,font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'}};
help.getRange('A9:B13').values=[['Codigo','0001, 0002'],['Descripcion','Café, Galleta'],['Cantidad','2, 3'],['CostoSKU','100.50, 20'],['Cajas/Fardos','Caja, Fardo']];help.getRange('B9:B13').setNumberFormat('@');help.getRange('A9:B13').format.fill=cream;
help.getRange('A15:B22').values=[['Orden','El primer valor de cada lista pertenece al primer SKU, el segundo al segundo SKU.'],['Decimales','En listas usa punto decimal y no uses separador de miles. Ejemplo: 1250.50, 20.'],['Comas en descripción','Usa comillas: "Café, molido", Galleta'],['CostoTotal','Suma Cantidad × CostoSKU de los productos de la fila. En este ejemplo: 261.00.'],['Ceros iniciales','Codigo y NumeroFactura están formateados como texto. Conserva valores como 0001.'],['Fechas y gestores','Usa día/mes/año, con hora opcional. GestorN1 usa el primer nombre y primer apellido del catálogo de usuarios.'],['Límites','Hasta 200 SKU por gestión y 10,000 productos por importación.'],['Más filas','Puedes continuar debajo de la fila 201 conservando los mismos encabezados.']];
wb.recalculate();console.log((await wb.inspect({kind:'region',sheetId:'Importar',range:'A1:F2',maxChars:1500})).ndjson);
const out=fileURLToPath(new URL('../reports/plantilla-importacion.xlsx',import.meta.url));
await (await SpreadsheetFile.exportXlsx(wb)).save(out);
// ExcelJS expects unprefixed SpreadsheetML tags. Preserve the same namespace
// using its default declaration so the downloadable template can round-trip.
const zip=await Zip.loadAsync(await fs.readFile(out));
for(const path of Object.keys(zip.files).filter(p=>p.endsWith('.xml'))){let xml=await zip.file(path).async('string');if(xml.includes('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')){xml=xml.replace('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(/<(\/?)x:/g,'<$1');zip.file(path,xml);}}
await fs.writeFile(out,await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
const previewDir=process.env.BIA_TEMPLATE_PREVIEW_DIR;
if(previewDir){await fs.mkdir(previewDir,{recursive:true});for(const [name,range] of [['Importar','I1:M6'],['Instrucciones','A1:B22']])await fs.writeFile(path.join(previewDir,name+'.png'),new Uint8Array(await(await wb.render({sheetName:name,range,scale:1.3,format:'png'})).arrayBuffer()));}
await fs.rm(out+'.inspect.ndjson',{force:true});
