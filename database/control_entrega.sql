begin;
alter table public.liquidadoras add column if not exists celular text;
comment on column public.liquidadoras.celular is 'Celular de contacto para el control de entrega de devoluciones. Actualización manual.';
create table if not exists public.devoluciones_entregas(
 id uuid primary key default gen_random_uuid(),sede text not null references public.sedes(codigo),gestor_n2 integer not null references public.usuarios(id),
 liquidadora text not null references public.liquidadoras(nombre),celular text,creado_por uuid not null references auth.users(id),
 creado_at timestamptz not null default now(),cerrado_at timestamptz,fecha_impresion timestamptz,version integer not null default 1,
 constraint dev_entrega_celular_len check(celular is null or length(celular)<=40)
);
create table if not exists public.devoluciones_entrega_items(
 entrega_id uuid not null references public.devoluciones_entregas(id),devolucion_id uuid not null unique references public.devoluciones(id),
 orden integer not null,datos jsonb not null check(jsonb_typeof(datos)='object'),primary key(entrega_id,devolucion_id),unique(entrega_id,orden)
);
create index if not exists dev_entregas_sede_fecha on public.devoluciones_entregas(sede,creado_at desc);
alter table public.devoluciones_entregas enable row level security;
alter table public.devoluciones_entrega_items enable row level security;
revoke all on public.devoluciones_entregas,public.devoluciones_entrega_items from anon,authenticated;
grant select on public.devoluciones_entregas,public.devoluciones_entrega_items to authenticated;
drop policy if exists dev_entrega_lectura on public.devoluciones_entregas;
create policy dev_entrega_lectura on public.devoluciones_entregas for select to authenticated using(devoluciones_privado.autorizado() and public.usuario_puede_sede(sede));
drop policy if exists dev_entrega_items_lectura on public.devoluciones_entrega_items;
create policy dev_entrega_items_lectura on public.devoluciones_entrega_items for select to authenticated using(exists(select 1 from public.devoluciones_entregas e where e.id=entrega_id));
create or replace function devoluciones_privado.puede_gestionar_entrega(p_sede text) returns boolean
language sql stable security definer set search_path='' as $$
 select devoluciones_privado.autorizado() and public.usuario_puede_sede(p_sede) and
 (public.usuario_es_maestro() or exists(select 1 from public.usuarios_sedes s where s.user_id=auth.uid() and s.sede=p_sede and s.activo and s.rol in ('admin','operador')));
$$;
create or replace function devoluciones_privado.entrega_obtener(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.devoluciones_entregas; result jsonb;
begin
 select * into e from public.devoluciones_entregas where id=p_id;
 if not found or not devoluciones_privado.autorizado() or not public.usuario_puede_sede(e.sede) then raise exception 'Control no encontrado o sin acceso';end if;
 select to_jsonb(e)||jsonb_build_object('zona',s.nombre,'gestor_nombre',coalesce(u.nombre_corto,u.usuario),'celular',coalesce(e.celular,l.celular,''),'puede_editar',devoluciones_privado.puede_gestionar_entrega(e.sede),
 'filas',coalesce((select jsonb_agg(jsonb_build_object('devolucion_id',i.devolucion_id,'orden',i.orden,'datos',i.datos) order by i.orden) from public.devoluciones_entrega_items i where i.entrega_id=e.id),'[]'::jsonb))
 into result from public.sedes s join public.usuarios u on u.id=e.gestor_n2 join public.liquidadoras l on l.nombre=e.liquidadora where s.codigo=e.sede;
 return result;
end$$;
create or replace function devoluciones_privado.entrega_anexar(p_id uuid,p_version integer,p_gestor integer,p_liquidadora text,p_entrega uuid default null,p_recuperar boolean default false,p_comentario text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.devoluciones;e public.devoluciones_entregas;v_id uuid;v_orden integer;v_desc text;
begin
 select * into d from public.devoluciones where id=p_id and eliminado_at is null for update;
 if not found or not devoluciones_privado.puede_gestionar_entrega(d.sede) then raise exception 'Sin permiso para gestionar esta devolución';end if;
 select entrega_id into v_id from public.devoluciones_entrega_items where devolucion_id=d.id;
 if found then return jsonb_build_object('control',devoluciones_privado.entrega_obtener(v_id),'ya_existia',true);end if;
 if length(coalesce(p_comentario,''))>4000 then raise exception 'El comentario supera 4000 caracteres';end if;
 if p_recuperar is null then raise exception 'Modo de gestión inválido';end if;
 if p_version is null or d.version<>p_version then raise exception 'La gestión cambió. Busca nuevamente antes de continuar';end if;
 if p_recuperar then
  if d.estado not in ('Enviado a Liquidacion','Nota de Débito Entregada','Finalizada') or d.gestor_n2 is null or d.liquidadora is null then raise exception 'Esta gestión no tiene los datos de N2 para preparar un control';end if;
  p_gestor:=d.gestor_n2;p_liquidadora:=d.liquidadora;
 elsif d.estado<>'Ingresada' then raise exception 'La gestión N2 ya fue tomada. Busca nuevamente';end if;
 if not exists(select 1 from public.usuarios where id=p_gestor and (activo or p_recuperar)) then raise exception 'Selecciona un gestor activo';end if;
 if not exists(select 1 from public.liquidadoras where nombre=p_liquidadora) then raise exception 'Selecciona una liquidadora';end if;
 if p_entrega is null then
  insert into public.devoluciones_entregas(sede,gestor_n2,liquidadora,creado_por) values(d.sede,p_gestor,p_liquidadora,auth.uid()) returning * into e;
 else
  select * into e from public.devoluciones_entregas where id=p_entrega for update;
  if not found or e.cerrado_at is not null then raise exception 'El control ya está cerrado. Prepara uno nuevo';end if;
  if e.creado_por<>auth.uid() and not public.usuario_es_maestro() then raise exception 'Continúa únicamente tus propios controles abiertos';end if;
  if e.sede<>d.sede or e.gestor_n2<>p_gestor or e.liquidadora<>p_liquidadora then raise exception 'Este control tiene otra sede, gestor o liquidadora. Termina el control pendiente antes de iniciar otro';end if;
 end if;
 select coalesce(max(orden),0)+1 into v_orden from public.devoluciones_entrega_items where entrega_id=e.id;
 if v_orden>200 then raise exception 'Máximo 200 devoluciones por control';end if;
 if not p_recuperar then perform devoluciones_privado.avanzar(d.id,p_version,'Enviado a Liquidacion',p_gestor,p_liquidadora,p_comentario=>coalesce(nullif(trim(p_comentario),''),'Tomar gestión N2 / control de entrega'));end if;
 select string_agg(x.codigo||' - '||x.descripcion,E'\n' order by case when x.datos_originales->>'fila_origen' ~ '^[0-9]{1,9}$' then (x.datos_originales->>'fila_origen')::integer end nulls last,case when x.datos_originales#>>'{producto,indice}' ~ '^[0-9]{1,9}$' then (x.datos_originales#>>'{producto,indice}')::integer end nulls last,x.id) into v_desc from public.devoluciones_detalle x where x.devolucion_id=d.id;
 insert into public.devoluciones_entrega_items(entrega_id,devolucion_id,orden,datos) values(e.id,d.id,v_orden,
 jsonb_build_object('gestion',d.gestion,'factura',d.factura,'cliente',d.cliente,'descripcion',coalesce(v_desc,''),'liq','','observacion',d.observacion,'bodega_origen',d.bodega_origen,'bodega_destino',d.bodega_destino));
 update public.devoluciones_entregas set version=version+1 where id=e.id;
 return jsonb_build_object('control',devoluciones_privado.entrega_obtener(e.id),'ya_existia',false);
end$$;
create or replace function devoluciones_privado.entrega_guardar(p_id uuid,p_version integer,p_celular text,p_filas jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.devoluciones_entregas;f jsonb;v_count integer;
begin
 select * into e from public.devoluciones_entregas where id=p_id for update;
 if not found or not devoluciones_privado.puede_gestionar_entrega(e.sede) then raise exception 'Sin permiso para editar este control';end if;
 if p_version is null or e.version<>p_version then raise exception 'El control cambió. Vuelve a abrirlo antes de guardar';end if;
 if length(coalesce(p_celular,''))>40 then raise exception 'Revisa el celular';end if;
 select count(*) into v_count from public.devoluciones_entrega_items where entrega_id=e.id;
 if p_filas is null or jsonb_typeof(p_filas)<>'array' or jsonb_array_length(p_filas)<>v_count then raise exception 'Las filas del control cambiaron';end if;
 if (select count(distinct value->>'devolucion_id') from jsonb_array_elements(p_filas))<>v_count then raise exception 'Hay filas repetidas en el control';end if;
 for f in select value from jsonb_array_elements(p_filas) loop
  if not exists(select 1 from public.devoluciones_entrega_items where entrega_id=e.id and devolucion_id::text=f->>'devolucion_id') then raise exception 'La fila no pertenece a este control';end if;
  if length(trim(coalesce(f->>'factura',''))) not between 1 and 120 or length(trim(coalesce(f->>'cliente',''))) not between 1 and 250 or length(coalesce(f->>'descripcion',''))>40000 or length(coalesce(f->>'observacion',''))>4000 or length(coalesce(f->>'liq',''))>100 or length(trim(coalesce(f->>'bodega_origen',''))) not between 1 and 120 or length(trim(coalesce(f->>'bodega_destino',''))) not between 1 and 120 then raise exception 'Revisa los datos del documento';end if;
  update public.devoluciones_entrega_items set datos=datos||jsonb_build_object('factura',trim(f->>'factura'),'cliente',trim(f->>'cliente'),'descripcion',coalesce(f->>'descripcion',''),'liq',coalesce(f->>'liq',''),'observacion',coalesce(f->>'observacion',''),'bodega_origen',trim(f->>'bodega_origen'),'bodega_destino',trim(f->>'bodega_destino')) where entrega_id=e.id and devolucion_id::text=f->>'devolucion_id';
 end loop;
 update public.devoluciones_entregas set celular=(select case when coalesce(p_celular,'')=coalesce(l.celular,'') then null else coalesce(p_celular,'') end from public.liquidadoras l where l.nombre=e.liquidadora),version=version+1 where id=e.id;
 return devoluciones_privado.entrega_obtener(e.id);
end$$;
create or replace function devoluciones_privado.entrega_cerrar(p_id uuid,p_version integer,p_imprimir boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.devoluciones_entregas;
begin
 select * into e from public.devoluciones_entregas where id=p_id for update;
 if not found or not devoluciones_privado.puede_gestionar_entrega(e.sede) then raise exception 'Sin permiso para gestionar este control';end if;
 if p_version is null or e.version<>p_version then raise exception 'El control cambió. Vuelve a abrirlo antes de continuar';end if;
 update public.devoluciones_entregas set cerrado_at=coalesce(cerrado_at,now()),fecha_impresion=case when p_imprimir then now() else fecha_impresion end,version=version+1 where id=e.id;
 return devoluciones_privado.entrega_obtener(e.id);
end$$;
create or replace function devoluciones_privado.entregas_listar() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not devoluciones_privado.autorizado() then raise exception 'Inicia sesión para continuar';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_at desc) from (
 select e.*,s.nombre as zona,coalesce(u.nombre_corto,u.usuario) as gestor_nombre,(select count(*) from public.devoluciones_entrega_items i where i.entrega_id=e.id) as facturas
 from public.devoluciones_entregas e join public.sedes s on s.codigo=e.sede join public.usuarios u on u.id=e.gestor_n2
 where public.usuario_puede_sede(e.sede) order by e.creado_at desc limit 50)x),'[]'::jsonb);
end$$;
create or replace function public.dev_entrega_obtener(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select devoluciones_privado.entrega_obtener(p_id)$$;
create or replace function public.dev_tomar_gestion_n2(p_id uuid,p_version integer,p_gestor integer,p_liquidadora text,p_entrega uuid default null,p_comentario text default '') returns jsonb language sql security invoker set search_path='' as $$select devoluciones_privado.entrega_anexar(p_id,p_version,p_gestor,p_liquidadora,p_entrega,false,p_comentario)$$;
create or replace function public.dev_entrega_recuperar(p_id uuid,p_version integer) returns jsonb language sql security invoker set search_path='' as $$select devoluciones_privado.entrega_anexar(p_id,p_version,null,null,null,true)$$;
create or replace function public.dev_entrega_guardar(p_id uuid,p_version integer,p_celular text,p_filas jsonb) returns jsonb language sql security invoker set search_path='' as $$select devoluciones_privado.entrega_guardar(p_id,p_version,p_celular,p_filas)$$;
create or replace function public.dev_entrega_cerrar(p_id uuid,p_version integer,p_imprimir boolean default false) returns jsonb language sql security invoker set search_path='' as $$select devoluciones_privado.entrega_cerrar(p_id,p_version,p_imprimir)$$;
create or replace function public.dev_entregas_listar() returns jsonb language sql security invoker set search_path='' as $$select devoluciones_privado.entregas_listar()$$;
-- Keep client catalog compatibility while exposing contact data to signed-in users.
do $patch$declare body text;begin
 select pg_get_functiondef('devoluciones_privado.catalogos()'::regprocedure) into body;
 if position('liquidadoras_detalle' in body)=0 then
  if position('''usuario_id'',' in body)=0 then raise exception 'Revisar la función de catálogos antes de actualizar';end if;
  body:=replace(body,'''usuario_id'',','''liquidadoras_detalle'',(select coalesce(jsonb_agg(jsonb_build_object(''nombre'',nombre,''celular'',coalesce(celular,'''')) order by nombre),''[]''::jsonb) from public.liquidadoras),''usuario_id'',');execute body;
 end if;
end$patch$;
-- Apply write-role checks to N3/N4 as well as N2 without changing the four stages.
do $patch$declare body text;begin
 select pg_get_functiondef('devoluciones_privado.avanzar(uuid,integer,text,integer,text,text)'::regprocedure) into body;
 if position('puede_gestionar_entrega' in body)=0 then
 if position('if v.version<>p_version then' in body)=0 then raise exception 'Revisar la función de seguimiento antes de actualizar';end if;
 body:=replace(body,'if v.version<>p_version then','if not devoluciones_privado.puede_gestionar_entrega(v.sede) then raise exception ''Sin permiso para gestionar esta devolución'';end if; if p_version is null or v.version<>p_version then');execute body;
 end if;
end$patch$;
revoke all on function devoluciones_privado.puede_gestionar_entrega(text) from public,anon,authenticated;
revoke all on function devoluciones_privado.entrega_obtener(uuid),devoluciones_privado.entrega_anexar(uuid,integer,integer,text,uuid,boolean,text),devoluciones_privado.entrega_guardar(uuid,integer,text,jsonb),devoluciones_privado.entrega_cerrar(uuid,integer,boolean),devoluciones_privado.entregas_listar(),public.dev_entrega_obtener(uuid),public.dev_tomar_gestion_n2(uuid,integer,integer,text,uuid,text),public.dev_entrega_recuperar(uuid,integer),public.dev_entrega_guardar(uuid,integer,text,jsonb),public.dev_entrega_cerrar(uuid,integer,boolean),public.dev_entregas_listar() from public,anon;
grant execute on function devoluciones_privado.entrega_obtener(uuid),devoluciones_privado.entrega_anexar(uuid,integer,integer,text,uuid,boolean,text),devoluciones_privado.entrega_guardar(uuid,integer,text,jsonb),devoluciones_privado.entrega_cerrar(uuid,integer,boolean),devoluciones_privado.entregas_listar(),public.dev_entrega_obtener(uuid),public.dev_tomar_gestion_n2(uuid,integer,integer,text,uuid,text),public.dev_entrega_recuperar(uuid,integer),public.dev_entrega_guardar(uuid,integer,text,jsonb),public.dev_entrega_cerrar(uuid,integer,boolean),public.dev_entregas_listar() to authenticated;
notify pgrst,'reload schema';
commit;
