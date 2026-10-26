import {test} from 'node:test';
import assert from 'node:assert/strict';
import {askDeliveryContinuation} from '../continuation-dialog.mjs';

test('Sí and No select distinct paths; closing the dialog leaves the control pending',async()=>{
 for(const [answer,expected] of [['si',true],['no',false],['',null]]){
  let onClose;const dialog={returnValue:'previous',addEventListener(type,fn){assert.equal(type,'close');onClose=fn},removeEventListener(){},showModal(){assert.equal(this.returnValue,'');this.returnValue=answer;onClose()}};
  assert.equal(await askDeliveryContinuation(dialog),expected);
 }
});
