-- Preserve all 31 original Excel cells per product without changing existing
-- auth checks, RLS, transaction handling or the historical import RPC signature.
begin;
alter table public.devoluciones_detalle add column if not exists datos_originales jsonb;
do $patch$
declare body text;
begin
 select pg_get_functiondef('devoluciones_privado.importar_historico(jsonb)'::regprocedure) into body;
 if position('costo_unitario,datos_originales)' in body)=0 then
  if position('devoluciones_detalle(devolucion_id,codigo,descripcion,cantidad,costo_unitario)' in body)=0 or position('(x.value->>''costo_unitario'')::numeric from jsonb_array_elements(p_filas)' in body)=0 then raise exception 'La función de importación cambió; revisar antes de actualizar'; end if;
  body:=replace(body,'devoluciones_detalle(devolucion_id,codigo,descripcion,cantidad,costo_unitario)','devoluciones_detalle(devolucion_id,codigo,descripcion,cantidad,costo_unitario,datos_originales)');
  body:=replace(body,'(x.value->>''costo_unitario'')::numeric from jsonb_array_elements(p_filas)','(x.value->>''costo_unitario'')::numeric,case when jsonb_typeof(x.value->''datos_originales'')=''object'' then x.value->''datos_originales'' else null end from jsonb_array_elements(p_filas)');
  body:=replace(body,'Importado desde histórico CSV','Importado desde histórico Excel / CSV');
  execute body;
 end if;
end;
$patch$;
comment on column public.devoluciones_detalle.datos_originales is 'Celdas originales del histórico Excel, incluidas columnas auxiliares; los indicadores operativos se calculan con los datos normalizados.';
commit;
