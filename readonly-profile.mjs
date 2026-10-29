const READ_RPCS=new Set(['bia_profile','dev_catalogos','dev_puede_admin_usuarios','dev_entregas_listar','dev_entrega_obtener']);
export function isReadOnlyProfile(profile){return profile?.role_code==='liquidadora'}
export function mayCallRpc(name,readOnly){return !readOnly||READ_RPCS.has(name)}
export function mayUseView(view,readOnly){return !readOnly||!['ingreso','usuarios'].includes(view)}

