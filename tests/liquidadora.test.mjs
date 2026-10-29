import test from 'node:test';
import assert from 'node:assert/strict';
import {isReadOnlyProfile,mayCallRpc,mayUseView} from '../readonly-profile.mjs';
test('Solo lectura reconoce el perfil Liquidadora',()=>{assert.equal(isReadOnlyProfile({role_code:'liquidadora'}),true);assert.equal(isReadOnlyProfile({role_code:'coordinador'}),false)});
test('Lectura permite consultas y rechaza toda escritura',()=>{for(const name of ['bia_profile','dev_catalogos','dev_entregas_listar','dev_entrega_obtener'])assert.equal(mayCallRpc(name,true),true);for(const name of ['dev_crear','dev_editar','dev_eliminar','dev_avanzar','dev_entrega_cerrar','dev_entrega_guardar','dev_importar_historico','future_rpc'])assert.equal(mayCallRpc(name,true),false)});
test('Vistas de ingreso y usuarios no se abren con Liquidadora',()=>{assert.equal(mayUseView('ingreso',true),false);assert.equal(mayUseView('usuarios',true),false);assert.equal(mayUseView('seguimiento',true),true)});
