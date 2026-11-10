alter table public.negocio add column if not exists "IDCliente" text;
CREATE OR REPLACE FUNCTION devoluciones_privado.catalogos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not devoluciones_privado.autorizado() then raise exception 'Acceso no autorizado'; end if;
 return jsonb_build_object(
 'sedes',(select coalesce(jsonb_agg(to_jsonb(s) order by s.nombre),'[]') from public.sedes s where public.usuario_puede_sede(s.codigo)),
 'usuarios',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'usuario',u.usuario,'nombre_corto',u.nombre_corto,'correo',u.correo) order by coalesce(u.nombre_corto,u.usuario)),'[]') from public.usuarios u where u.activo is true),
 'observaciones',(select jsonb_agg(nombre order by nombre) from public.observaciones),
 'estados',(select jsonb_agg(nombre order by case nombre when 'Ingresada' then 1 when 'Enviado a Liquidacion' then 2 when 'Nota de Débito Entregada' then 3 when 'Finalizada' then 4 when 'Anulada' then 5 end) from public.estados),
 'negocio_ids',(select coalesce(jsonb_agg(jsonb_build_object('nombre',nombre,'idcliente',"IDCliente")),'[]'::jsonb) from public.negocio where "IDCliente" is not null),
 'negocio',(select jsonb_agg(nombre order by nombre) from public.negocio),
 'liquidadoras',(select jsonb_agg(nombre order by nombre) from public.liquidadoras),
 'liquidadoras_detalle',(select coalesce(jsonb_agg(jsonb_build_object('nombre',nombre,'celular',coalesce(celular,'')) order by nombre),'[]'::jsonb) from public.liquidadoras),'usuario_id',(select id from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1));
end $function$
;
notify pgrst,'reload schema';
