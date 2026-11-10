import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {clientIdLookup,createDashboardXlsx,EXPORT_HEADERS} from '../dashboard-report.mjs';
test('client IDs match case and spacing while ambiguous and missing names stay blank',()=>{
 const lookup=clientIdLookup({negocio_ids:[{nombre:'Cliente A',idcliente:'000605'},{nombre:'Duplicado',idcliente:'1'},{nombre:' duplicado ',idcliente:'2'},{nombre:'DUPLICADO',idcliente:'1'}]});
 assert.equal(lookup(' CLIENTE   A '),'000605');assert.equal(lookup('Duplicado'),'');assert.equal(lookup('Sin coincidencia'),'');
});
test('export places text IDCliente directly before NombreCliente and retains management ID',async()=>{
 const Zip=createRequire(import.meta.url)('../vendor/jszip.min.js');
 const row={gestion:'DEV-PRUEBA',fecha_registro:'2026-11-10T12:00:00Z',cliente:'Cliente A',sede:'SPS',estado:'Ingresada',devoluciones_detalle:[]};
 const {bytes}=await createDashboardXlsx({rows:[row],catalogs:{negocio_ids:[{nombre:'Cliente A',idcliente:'000605'}]},template:await fs.readFile(new URL('../reports/dashboard-template.xlsx',import.meta.url)),Zip});
 const zip=await Zip.loadAsync(bytes),sheet=await zip.file('xl/worksheets/sheet4.xml').async('string');
 const index=EXPORT_HEADERS.indexOf('NombreCliente');assert.equal(EXPORT_HEADERS[index-1],'IDCliente');assert.equal(EXPORT_HEADERS[0],'IDGestion');
 assert(sheet.includes('>000605</x:t>'));assert(sheet.includes('>DEV-PRUEBA</x:t>'));assert((await zip.file('xl/tables/table2.xml').async('string')).includes('A5:AG6'));
});
