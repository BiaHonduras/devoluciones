export function askDeliveryContinuation(dialog){
 return new Promise((resolve,reject)=>{
  dialog.returnValue='';
  const closed=()=>resolve(dialog.returnValue==='si'?true:dialog.returnValue==='no'?false:null);
  dialog.addEventListener('close',closed,{once:true});
  try{dialog.showModal()}catch(error){dialog.removeEventListener('close',closed);reject(error)}
 });
}
