-- Five operational states; preserve historical audit events and original cells.
begin;
lock table public.devoluciones in access exclusive mode;
insert into public.estados(nombre) values ('Ingresada'),('Enviado a Liquidacion'),('Nota de Débito Entregada'),('Finalizada'),('Anulada') on conflict do nothing;
create temporary table dev_cambio_estados on commit drop as
select id,estado as anterior,case estado
 when 'Nivel 1 Ingresado' then 'Ingresada'
 when 'Pendiente Liquidadora' then 'Enviado a Liquidacion'
 when 'Nota Débito Liquidadora' then 'Nota de Débito Entregada'
 when 'Pendiente GP' then 'Nota de Débito Entregada'
 when 'Finalizado' then 'Finalizada'
 when 'Anulado' then 'Anulada'
 when 'Atrasado' then case when fecha_finalizado is not null then 'Finalizada' when fecha_nota_debito is not null or fecha_ingreso_gp is not null then 'Nota de Débito Entregada' when fecha_entrega_liquidadora is not null then 'Enviado a Liquidacion' else 'Ingresada' end
 else estado end as nuevo from public.devoluciones;
do $$begin
 if exists(select 1 from dev_cambio_estados where nuevo not in ('Ingresada','Enviado a Liquidacion','Nota de Débito Entregada','Finalizada','Anulada')) then raise exception 'Hay estados no reconocidos; revisar antes de migrar'; end if;
end$$;
-- The table lock excludes concurrent writes while archived records are migrated.
alter table public.devoluciones disable trigger dev_no_modificar_eliminada;
update public.devoluciones d set estado=c.nuevo,version=d.version+1 from dev_cambio_estados c where d.id=c.id and c.anterior<>c.nuevo;
alter table public.devoluciones enable trigger dev_no_modificar_eliminada;
-- Keep prior audit events intact; this administrative catalog migration does
-- not impersonate an operational user or fabricate workflow movements.
alter table public.devoluciones alter column estado set default 'Ingresada';
delete from public.estados where nombre not in ('Ingresada','Enviado a Liquidacion','Nota de Débito Entregada','Finalizada','Anulada');
alter table public.estados drop constraint if exists estados_devoluciones_permitidos;
alter table public.estados add constraint estados_devoluciones_permitidos check(nombre in ('Ingresada','Enviado a Liquidacion','Nota de Débito Entregada','Finalizada','Anulada'));

CREATE OR REPLACE FUNCTION devoluciones_privado.crear(p_datos jsonb, p_items jsonb, p_solicitud uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_gestion text; v_n integer; v_item jsonb; v_cod jsonb; v_fecha date := (now() at time zone 'America/Tegucigalpa')::date;
begin
 if not devoluciones_privado.autorizado() or not public.usuario_puede_sede(p_datos->>'sede') then raise exception 'Sin acceso a esta sede'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
 select id,gestion into v_id,v_gestion from public.devoluciones where solicitud_id=p_solicitud and creado_por=auth.uid();
 if found then return jsonb_build_object('id',v_id,'gestion',v_gestion); end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Agregue los códigos'; end if; if jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Agregue entre 1 y 200 códigos'; end if;
 if not exists(select 1 from public.usuarios where id=(p_datos->>'gestor_n1')::integer and activo is true) then raise exception 'Gestor no válido'; end if;
 insert into devoluciones_privado.consecutivos values(v_fecha,1) on conflict(fecha) do update set numero=devoluciones_privado.consecutivos.numero+1 returning numero into v_n;
 v_gestion:='DEV-'||to_char(v_fecha,'DDMMYYYY')||'-'||case when v_n<10 then '0'||v_n::text else v_n::text end;
 insert into public.devoluciones(solicitud_id,gestion,sede,gestor_n1,factura,cliente,observacion,bodega_origen,bodega_destino,comentario,creado_por)
 values(p_solicitud,v_gestion,p_datos->>'sede',(p_datos->>'gestor_n1')::integer,trim(p_datos->>'factura'),p_datos->>'cliente',p_datos->>'observacion',trim(p_datos->>'bodega_origen'),trim(p_datos->>'bodega_destino'),coalesce(p_datos->>'comentario',''),auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_cod:=devoluciones_privado.codigo(v_item->>'codigo');
  insert into public.devoluciones_detalle(devolucion_id,codigo,descripcion,cantidad,costo_unitario) values(v_id,v_cod->>'codigo',v_cod->>'descripcion',(v_item->>'cantidad')::numeric,(v_cod->>'costo')::numeric);
 end loop;
 insert into public.devoluciones_historial(devolucion_id,actor,actor_nombre,estado_nuevo) values(v_id,auth.uid(),(select coalesce(nombre_corto,usuario) from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1),'Ingresada');
 return jsonb_build_object('id',v_id,'gestion',v_gestion);
end $function$;

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
 'negocio',(select jsonb_agg(nombre order by nombre) from public.negocio),
 'liquidadoras',(select jsonb_agg(nombre order by nombre) from public.liquidadoras),
 'usuario_id',(select id from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1));
end $function$;

create or replace function devoluciones_privado.avanzar(p_id uuid,p_version integer,p_estado text,p_gestor integer,p_liquidadora text,p_comentario text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.devoluciones; v_next text;
begin
 select * into v from public.devoluciones where id=p_id for update;
 if not found or not devoluciones_privado.autorizado() or not public.usuario_puede_sede(v.sede) then raise exception 'Gestión no encontrada o sin acceso'; end if;
 if v.eliminado_at is not null then raise exception 'La gestión fue eliminada'; end if;
 if v.version<>p_version then raise exception 'La gestión cambió. Busque nuevamente antes de continuar'; end if;
 v_next:=case v.estado when 'Ingresada' then 'Enviado a Liquidacion' when 'Enviado a Liquidacion' then 'Nota de Débito Entregada' when 'Nota de Débito Entregada' then 'Finalizada' end;
 if v_next is null or p_estado is null or (p_estado<>v_next and p_estado<>'Anulada') then raise exception 'Cambio de estado no permitido'; end if;
 if p_estado='Anulada' and length(trim(coalesce(p_comentario,'')))=0 then raise exception 'Indique el motivo de la anulación'; end if;
 if not exists(select 1 from public.usuarios where id=p_gestor and activo is true) then raise exception 'Seleccione un gestor activo'; end if;
 if p_estado='Enviado a Liquidacion' and not exists(select 1 from public.liquidadoras where nombre=p_liquidadora) then raise exception 'Seleccione una liquidadora'; end if;
 update public.devoluciones set estado=p_estado,version=version+1,
 gestor_n2=case when p_estado='Enviado a Liquidacion' then p_gestor else gestor_n2 end,
 gestor_n4=case when p_estado='Finalizada' then p_gestor else gestor_n4 end,
 liquidadora=case when p_estado='Enviado a Liquidacion' then p_liquidadora else liquidadora end,
 fecha_entrega_liquidadora=case when p_estado='Enviado a Liquidacion' then now() else fecha_entrega_liquidadora end,
 fecha_nota_debito=case when p_estado='Nota de Débito Entregada' then now() else fecha_nota_debito end,
 fecha_ingreso_gp=case when p_estado='Finalizada' then coalesce(fecha_ingreso_gp,now()) else fecha_ingreso_gp end,
 fecha_finalizado=case when p_estado='Finalizada' then now() else fecha_finalizado end where id=p_id;
 insert into public.devoluciones_historial(devolucion_id,actor,actor_nombre,estado_anterior,estado_nuevo,comentario)
 values(p_id,auth.uid(),(select coalesce(nombre_corto,usuario) from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1),v.estado,p_estado,coalesce(p_comentario,''));
end $$;
-- Retain the RPC signature for old clients but disallow the removed Atrasado state.
create or replace function devoluciones_privado.reanudar(p_id uuid,p_version integer,p_gestor integer,p_comentario text)
returns void language plpgsql security invoker set search_path='' as $$begin raise exception 'La opción Atrasado ya no está disponible. Actualice la página.';end$$;
notify pgrst,'reload schema';
commit;
