import {parseExcelRows} from './paste-import.mjs?v=20261021-multisku';
export function cellText(cell,row,column){let value=cell.value;if(value===null||value===undefined)return '';
 if(value&&typeof value==='object'&&('formula'in value||'sharedFormula'in value)){if(value.result===undefined||value.result===null)throw Error(`Fila ${row}, columna ${column}: la fórmula no tiene un resultado guardado. Abre el archivo en Excel, recalcula y guarda antes de importarlo.`);value=value.result;}
 if(value instanceof Date){if(!Number.isFinite(+value))throw Error(`Fila ${row}: fecha inválida.`);const p=n=>String(n).padStart(2,'0');return `${p(value.getUTCDate())}/${p(value.getUTCMonth()+1)}/${value.getUTCFullYear()} ${p(value.getUTCHours())}:${p(value.getUTCMinutes())}:${p(value.getUTCSeconds())}`;}
 if(value&&typeof value==='object'){if(value.error)throw Error(`Fila ${row}, columna ${column}: Excel contiene ${value.error}.`);if(Array.isArray(value.richText))return value.richText.map(x=>x.text).join('');if(typeof value.text==='string')return value.text;throw Error(`Fila ${row}, columna ${column}: tipo de celda no compatible.`);}
 if(typeof value==='number'&&Number.isInteger(value)&&/^0+$/.test(cell.numFmt||''))return String(value).padStart(cell.numFmt.length,'0');
 return String(value);
}
export function excelSheetRows(sheet){const rows=[];sheet.eachRow({includeEmpty:false},row=>{
 const cells=Array.from({length:31},(_,i)=>cellText(row.getCell(i+1),row.number,i+1));
 if(!cells.some(s=>s.trim()))return;
 for(let i=32;i<=row.cellCount;i++)if(cellText(row.getCell(i),row.number,i).trim())throw Error(`Fila ${row.number}: hay información después de la columna Mes. Usa las 31 columnas de la plantilla.`);
 rows.push(cells);if(rows.length>10001)throw Error('El archivo supera 10,000 filas de origen.');
 });return rows;
}
export async function readExcelImport(buffer,catalog,Excel=globalThis.ExcelJS){
 if(!Excel){try{await import('https://biahonduras.github.io/control-tiempos/vendor/exceljs-4.4.0.min.js');Excel=globalThis.ExcelJS;}catch{throw Error('No se pudo cargar el lector de Excel. Revisa la conexión y recarga la página.');}}
 if(!Excel?.Workbook)throw Error('No se pudo cargar el lector de Excel. Recarga la página e intenta nuevamente.');
 const book=new Excel.Workbook();try{await book.xlsx.load(buffer)}catch{throw Error('No se pudo abrir el archivo XLSX. Guárdalo como Libro de Excel (.xlsx) e intenta nuevamente.');}
 const sheet=book.getWorksheet('Importar')||book.worksheets[0];if(!sheet)throw Error('El archivo no contiene hojas.');return parseExcelRows(excelSheetRows(sheet),catalog);
}
