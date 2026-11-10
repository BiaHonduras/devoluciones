alter table public.devoluciones add column if not exists fecha_factura date;
CREATE OR REPLACE FUNCTION devoluciones_privado.crear(p_datos jsonb, p_items jsonb, p_solicitud uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_gestion text; v_n integer; v_item jsonb; v_cod jsonb; v_fecha date := (now() at time zone 'America/Tegucigalpa')::date;
begin
 if not devoluciones_privado.autorizado() or not devoluciones_privado.puede_gestionar_entrega(p_datos->>'sede') then raise exception 'Sin acceso a esta sede'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
 select id,gestion into v_id,v_gestion from public.devoluciones where solicitud_id=p_solicitud and creado_por=auth.uid();
 if found then return jsonb_build_object('id',v_id,'gestion',v_gestion); end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Agregue los códigos'; end if; if jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Agregue entre 1 y 200 códigos'; end if;
 if not exists(select 1 from public.usuarios where id=(p_datos->>'gestor_n1')::integer and activo is true) then raise exception 'Gestor no válido'; end if;
 if coalesce(p_datos->>'fecha_factura','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Ingresa la Fecha Factura'; end if;
 perform (p_datos->>'fecha_factura')::date;
 insert into devoluciones_privado.consecutivos values(v_fecha,1) on conflict(fecha) do update set numero=devoluciones_privado.consecutivos.numero+1 returning numero into v_n;
 v_gestion:='DEV-'||to_char(v_fecha,'DDMMYYYY')||'-'||case when v_n<10 then '0'||v_n::text else v_n::text end;
 insert into public.devoluciones(solicitud_id,gestion,fecha_factura,sede,gestor_n1,factura,cliente,observacion,bodega_origen,bodega_destino,comentario,creado_por)
 values(p_solicitud,v_gestion,(p_datos->>'fecha_factura')::date,p_datos->>'sede',(p_datos->>'gestor_n1')::integer,trim(p_datos->>'factura'),p_datos->>'cliente',p_datos->>'observacion',trim(p_datos->>'bodega_origen'),trim(p_datos->>'bodega_destino'),coalesce(p_datos->>'comentario',''),auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_cod:=devoluciones_privado.codigo(v_item->>'codigo');
  insert into public.devoluciones_detalle(devolucion_id,codigo,descripcion,cantidad,costo_unitario) values(v_id,v_cod->>'codigo',v_cod->>'descripcion',(v_item->>'cantidad')::numeric,(v_cod->>'costo')::numeric);
 end loop;
 insert into public.devoluciones_historial(devolucion_id,actor,actor_nombre,estado_nuevo) values(v_id,auth.uid(),(select coalesce(nombre_corto,usuario) from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1),'Ingresada');
 return jsonb_build_object('id',v_id,'gestion',v_gestion);
end $function$
;
notify pgrst,'reload schema';
