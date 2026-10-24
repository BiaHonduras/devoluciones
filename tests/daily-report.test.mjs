import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {buildReportModel,createDashboardXlsx} from '../dashboard-report.mjs';
import {dailySeries} from '../dashboard-charts.mjs';
const Zip=createRequire(import.meta.url)('../vendor/jszip.min.js');
const rows=Array.from({length:7},(_,i)=>({id:'daily-'+i,gestion:'DEV-01102026-'+i,fecha_registro:`2026-${i===6?'11':'10'}-01T15:00:00Z`,sede:'SPS',gestor_n1:1,estado:i%2?'Ingresada':'Finalizada',bodega_destino:i%2?'095':'30',cliente:'Cliente',factura:'000'+i,observacion:'Motivo '+i,bodega_origen:'Ruta',devoluciones_detalle:[{codigo:'001',cantidad:1,costo_unitario:1,costo_total:1,datos_originales:{DIA:i+2}}]}));
test('daily export uses web DIA and month/state/destination grouping, not grouped periods',()=>{const model=buildReportModel(rows);assert.deepEqual(model.daily.series,dailySeries(rows).series);assert.equal(model.daily.months[1],'2026-11');assert.deepEqual(model.daily.destinations,['Todas las bodegas','030','095']);assert.equal(model.daily.series[0].values[1],1);assert.equal(model.daily.series[0].values[0],0);assert.equal(model.topReasons.length,5);assert(!model.topReasons.some(s=>s.other));});
test('XLSX daily labels rotate 270 degrees, all four charts label data, and chart filters stay editable',async()=>{
 const {bytes}=await createDashboardXlsx({rows,template:await fs.readFile(new URL('../reports/dashboard-template.xlsx',import.meta.url)),Zip});const zip=await Zip.loadAsync(bytes);
 const chart=await zip.file('xl/drawings/charts/chart1.xml').async('string');assert(chart.includes('<c:barChart>'));assert.match(chart,/<c:plotVisOnly val="0"\s*\/>/);const catAxis=chart.match(/<c:catAx>[\s\S]*?<\/c:catAx>/)[0];assert(catAxis.indexOf('<c:crossAx')<catAxis.indexOf('<c:tickLblSkip'));assert.equal((catAxis.match(/<c:tickLblSkip/g)||[]).length,1);assert(chart.includes('Finalizada (Bodega 030)'));assert(chart.includes('Ingresada (Bodega 095)'));assert(chart.includes('rot="-5400000"'));assert(chart.includes('dLblPos val="outEnd"'));assert(chart.includes('ptCount val="31"'));assert(chart.includes('Devoluciones por Día'));
 for(const i of [2,3,4]){const text=await zip.file(`xl/drawings/charts/chart${i}.xml`).async('string');assert(text.includes('<c:dLbls>'));assert(text.includes(i===2?'showPercent val="1"':'showVal val="1"'));if(i===2){assert(text.includes('ptCount val="5"'));assert(!text.includes('Otros'));}}
 const dash=await zip.file('xl/worksheets/sheet1.xml').async('string');for(const ref of ['A11','F11','K11','R52','V52'])assert(dash.includes(`sqref="${ref}"`));assert(dash.includes('type="date"'));assert(dash.includes('Resumen!$BP$2:$BP$4'));assert(dash.includes('Resumen!$BQ$2:$BQ$4'));assert(!dash.includes('r="55"'));assert(!dash.includes('r="56"'));assert(!dash.includes('r="57"'));
 const summary=await zip.file('xl/worksheets/sheet2.xml').async('string');assert(summary.includes('min="36" max="16384" hidden="1"'));assert(summary.includes('Dashboard!$A$11'));assert(summary.includes('Dashboard!$F$11'));assert(summary.includes('Dashboard!$K$11'));assert(summary.includes('Resumen!$BN$6:'));assert(summary.includes('Resumen!$BO$6:'));
 if(process.env.BIA_DAILY_QA_OUTPUT)await fs.writeFile(process.env.BIA_DAILY_QA_OUTPUT,bytes);
});
