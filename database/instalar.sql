begin;
create schema if not exists devoluciones_privado;
revoke all on schema devoluciones_privado from public,anon;
grant usage on schema devoluciones_privado to authenticated;
create table public.sedes(codigo text primary key,nombre text not null unique);
create table public.observaciones(nombre text primary key);
create table public.estados(nombre text primary key);
create table public.negocio(nombre text primary key);
create table public.liquidadoras(nombre text primary key);
create table devoluciones_privado.consecutivos(fecha date primary key,numero integer not null);
create table public.devoluciones(
 id uuid primary key default gen_random_uuid(), solicitud_id uuid not null unique,
 gestion text not null unique, fecha_registro timestamptz not null default now(),
 sede text not null references public.sedes(codigo),gestor_n1 integer not null references public.usuarios(id),
 gestor_n2 integer references public.usuarios(id),gestor_n4 integer references public.usuarios(id),
 liquidadora text references public.liquidadoras(nombre),factura text not null check(length(trim(factura))>0),
 cliente text not null references public.negocio(nombre),observacion text not null references public.observaciones(nombre),
 bodega_origen text not null check(length(trim(bodega_origen))>0),bodega_destino text not null check(length(trim(bodega_destino))>0),
 comentario text not null default '',estado text not null default 'Nivel 1 Ingresado' references public.estados(nombre),
 fecha_entrega_liquidadora timestamptz,fecha_nota_debito timestamptz,fecha_ingreso_gp timestamptz,fecha_finalizado timestamptz,
 creado_por uuid not null references auth.users(id),version integer not null default 1
);
create table public.devoluciones_detalle(
 id bigint generated always as identity primary key,devolucion_id uuid not null references public.devoluciones(id),
 codigo text not null,descripcion text not null,cantidad numeric(16,4) not null check(cantidad>0),
 costo_unitario numeric(16,4) not null check(costo_unitario>=0),
 costo_total numeric(20,2) generated always as (round(cantidad*costo_unitario,2)) stored,
 unique(devolucion_id,codigo)
);
create table public.devoluciones_historial(
 id bigint generated always as identity primary key,devolucion_id uuid not null references public.devoluciones(id),
 fecha timestamptz not null default now(),actor uuid not null references auth.users(id),
 actor_nombre text not null default '',estado_anterior text,estado_nuevo text not null,comentario text not null default ''
);
create index devoluciones_sede_fecha on public.devoluciones(sede,fecha_registro desc);
create index devoluciones_detalle_parent on public.devoluciones_detalle(devolucion_id);
create index devoluciones_historial_parent on public.devoluciones_historial(devolucion_id,fecha);
create function devoluciones_privado.autorizado() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.usuario_password_actualizada() and exists(select 1 from public.usuarios where auth_user_id=auth.uid() and activo is true);
$$;
create function devoluciones_privado.catalogos() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not devoluciones_privado.autorizado() then raise exception 'Acceso no autorizado'; end if;
 return jsonb_build_object(
 'sedes',(select coalesce(jsonb_agg(to_jsonb(s) order by s.nombre),'[]') from public.sedes s where public.usuario_puede_sede(s.codigo)),
 'usuarios',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'usuario',u.usuario,'nombre_corto',u.nombre_corto,'correo',u.correo) order by coalesce(u.nombre_corto,u.usuario)),'[]') from public.usuarios u where u.activo is true),
 'observaciones',(select jsonb_agg(nombre order by nombre) from public.observaciones),
 'estados',(select jsonb_agg(nombre order by nombre) from public.estados),
 'negocio',(select jsonb_agg(nombre order by nombre) from public.negocio),
 'liquidadoras',(select jsonb_agg(nombre order by nombre) from public.liquidadoras),
 'usuario_id',(select id from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1));
end $$;
create function devoluciones_privado.codigo(p_codigo text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb; n integer;
begin
 if not devoluciones_privado.autorizado() then raise exception 'Acceso no autorizado'; end if;
 select count(*) into n from public.codigos where codigo=trim(p_codigo);
 if n<>1 then raise exception 'Código no encontrado o duplicado en el catálogo'; end if;
 select jsonb_build_object('codigo',codigo,'descripcion',descripcion,'costo',costo) into v from public.codigos where codigo=trim(p_codigo);
 if v->>'costo' is null then raise exception 'El código no tiene costo configurado'; end if;
 return v;
end $$;
create function devoluciones_privado.crear(p_datos jsonb,p_items jsonb,p_solicitud uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
 insert into public.devoluciones_historial(devolucion_id,actor,actor_nombre,estado_nuevo) values(v_id,auth.uid(),(select coalesce(nombre_corto,usuario) from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1),'Nivel 1 Ingresado');
 return jsonb_build_object('id',v_id,'gestion',v_gestion);
end $$;
create function devoluciones_privado.avanzar(p_id uuid,p_version integer,p_estado text,p_gestor integer,p_liquidadora text,p_comentario text) returns void language plpgsql security definer set search_path='' as $$
declare v public.devoluciones; v_next text;
begin
 select * into v from public.devoluciones where id=p_id for update;
 if not found or not devoluciones_privado.autorizado() or not public.usuario_puede_sede(v.sede) then raise exception 'Gestión no encontrada o sin acceso'; end if;
 if v.version<>p_version then raise exception 'La gestión cambió. Busque nuevamente antes de continuar'; end if;
 v_next:=case v.estado when 'Nivel 1 Ingresado' then 'Pendiente Liquidadora' when 'Pendiente Liquidadora' then 'Nota Débito Liquidadora' when 'Nota Débito Liquidadora' then 'Pendiente GP' when 'Pendiente GP' then 'Finalizado' end;
 if v_next is null or (p_estado<>v_next and p_estado not in ('Anulado','Atrasado')) or p_estado is null then raise exception 'Cambio de estado no permitido'; end if;
 if p_estado in ('Anulado','Atrasado') and length(trim(coalesce(p_comentario,'')))=0 then raise exception 'Indique el motivo del cambio'; end if;
 if not exists(select 1 from public.usuarios where id=p_gestor and activo is true) then raise exception 'Seleccione un gestor activo'; end if;
 if p_estado='Pendiente Liquidadora' and not exists(select 1 from public.liquidadoras where nombre=p_liquidadora) then raise exception 'Seleccione una liquidadora'; end if;
 update public.devoluciones set estado=p_estado,version=version+1,
 gestor_n2=case when p_estado='Pendiente Liquidadora' then p_gestor else gestor_n2 end,
 gestor_n4=case when p_estado in ('Pendiente GP','Finalizado') then p_gestor else gestor_n4 end,
 liquidadora=coalesce(p_liquidadora,liquidadora),
 fecha_entrega_liquidadora=case when p_estado='Pendiente Liquidadora' then now() else fecha_entrega_liquidadora end,
 fecha_nota_debito=case when p_estado='Nota Débito Liquidadora' then now() else fecha_nota_debito end,
 fecha_ingreso_gp=case when p_estado='Pendiente GP' then now() else fecha_ingreso_gp end,
 fecha_finalizado=case when p_estado='Finalizado' then now() else fecha_finalizado end where id=p_id;
 insert into public.devoluciones_historial(devolucion_id,actor,actor_nombre,estado_anterior,estado_nuevo,comentario) values(p_id,auth.uid(),(select coalesce(nombre_corto,usuario) from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1),v.estado,p_estado,coalesce(p_comentario,''));
end $$;
create function devoluciones_privado.reanudar(p_id uuid,p_version integer,p_gestor integer,p_comentario text) returns void language plpgsql security definer set search_path='' as $$
declare v public.devoluciones; v_estado text;
begin
 select * into v from public.devoluciones where id=p_id for update;
 if not found or not devoluciones_privado.autorizado() or not public.usuario_puede_sede(v.sede) then raise exception 'Sin acceso'; end if;
 if v.version<>p_version or v.estado<>'Atrasado' then raise exception 'Busque nuevamente la gestión'; end if;
 if not exists(select 1 from public.usuarios where id=p_gestor and activo is true) then raise exception 'Seleccione un gestor'; end if;
 select estado_anterior into v_estado from public.devoluciones_historial where devolucion_id=p_id and estado_nuevo='Atrasado' order by id desc limit 1;
 update public.devoluciones set estado=v_estado,version=version+1 where id=p_id;
 insert into public.devoluciones_historial(devolucion_id,actor,actor_nombre,estado_anterior,estado_nuevo,comentario) values(p_id,auth.uid(),(select coalesce(nombre_corto,usuario) from public.usuarios where auth_user_id=auth.uid() and activo is true limit 1),'Atrasado',v_estado,coalesce(p_comentario,''));
end $$;
create function public.dev_catalogos() returns jsonb language sql security invoker set search_path='' as $$ select devoluciones_privado.catalogos(); $$;
create function public.dev_codigo(p_codigo text) returns jsonb language sql security invoker set search_path='' as $$ select devoluciones_privado.codigo(p_codigo); $$;
create function public.dev_crear(p_datos jsonb,p_items jsonb,p_solicitud uuid) returns jsonb language sql security invoker set search_path='' as $$ select devoluciones_privado.crear(p_datos,p_items,p_solicitud); $$;
create function public.dev_avanzar(p_id uuid,p_version integer,p_estado text,p_gestor integer,p_liquidadora text,p_comentario text) returns void language sql security invoker set search_path='' as $$ select devoluciones_privado.avanzar(p_id,p_version,p_estado,p_gestor,p_liquidadora,p_comentario); $$;
create function public.dev_reanudar(p_id uuid,p_version integer,p_gestor integer,p_comentario text) returns void language sql security invoker set search_path='' as $$ select devoluciones_privado.reanudar(p_id,p_version,p_gestor,p_comentario); $$;
do $$ declare t text; begin
 foreach t in array array['sedes','observaciones','estados','negocio','liquidadoras'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;
alter table public.devoluciones enable row level security;
alter table public.devoluciones_detalle enable row level security;
alter table public.devoluciones_historial enable row level security;
alter table devoluciones_privado.consecutivos enable row level security;
revoke all on public.devoluciones,public.devoluciones_detalle,public.devoluciones_historial from anon,authenticated;
grant select on public.devoluciones,public.devoluciones_detalle,public.devoluciones_historial to authenticated;
create policy dev_lectura on public.devoluciones for select to authenticated using(devoluciones_privado.autorizado() and public.usuario_puede_sede(sede));
create policy dev_detalle_lectura on public.devoluciones_detalle for select to authenticated using(exists(select 1 from public.devoluciones d where d.id=devolucion_id));
create policy dev_historial_lectura on public.devoluciones_historial for select to authenticated using(exists(select 1 from public.devoluciones d where d.id=devolucion_id));
revoke all on all functions in schema devoluciones_privado from public,anon;
grant execute on all functions in schema devoluciones_privado to authenticated;
revoke all on function public.dev_catalogos(), public.dev_codigo(text), public.dev_crear(jsonb,jsonb,uuid),public.dev_avanzar(uuid,integer,text,integer,text,text),public.dev_reanudar(uuid,integer,integer,text) from public,anon;
grant execute on function public.dev_catalogos(), public.dev_codigo(text),public.dev_crear(jsonb,jsonb,uuid),public.dev_avanzar(uuid,integer,text,integer,text,text),public.dev_reanudar(uuid,integer,integer,text) to authenticated;
-- Los catálogos se insertan antes del COMMIT en instalar.sql.

insert into public.sedes(codigo,nombre) values ('SPS','San Pedro Sula'),('CBA','La Ceiba'),('SRC','Santa Rosa de Copán'),('TGU','Tegucigalpa'),('AMT','Amarateca') on conflict do nothing;
insert into public.observaciones(nombre) values ('Cerrado'),('Cliente no lo pidió'),('Cliente no lo recibió'),('Duplicado'),('Error de Entrega'),('Error de Facturación'),('Error en Carga'),('Error en Fecha'),('Error en Precio'),('Faltante'),('Faltante en Caja Sellada'),('Fecha Corta'),('Negocio fuera de Cobertura'),('OC Duplicada'),('Pedido Improcedente'),('Pedido Mal Digitado'),('Pedido Rechazado'),('Producto Dañado'),('Producto mal Digitado'),('Producto Mieloso'),('Producto no Matriculado'),('Producto Vencido'),('Reproceso PFN'),('Sin Efectivo'),('Stockout') on conflict do nothing;
insert into public.estados(nombre) values ('Nivel 1 Ingresado'),('Pendiente Liquidadora'),('Nota Débito Liquidadora'),('Pendiente GP'),('Finalizado'),('Atrasado'),('Anulado') on conflict do nothing;
insert into public.negocio(nombre) values ('Abarroteria Angel'),('Abarroteria Axel y Zoeh'),('Abarroteria Carol'),('Abarrotería El Super Barato'),('Abarrotería Gissela'),('Abarroteria Jessica'),('Abarroteria Julia'),('Abarroteria Julissy'),('Abarroteria La Bendicion'),('Abarroteria La Economica'),('Abarroteria Las Flores'),('Abarroteria Lidyce'),('Abarroteria Nikcy'),('Abarroteria San Jose'),('Abarroteria Valle'),('Abarroteria y Bodega Las Acacias'),('Abarroteria y Supermercado Guillen'),('Banasupro Peña Blanca'),('Banasupro Victoria'),('Bodega Alejandro'),('Bodega Aqui Me Quedo'),('Bodega Chiki'),('Bodega La Bendicion'),('Bodega La Constitucion'),('Bodega La Magnolia'),('Bodega La Rivereña'),('Bodega M y M'),('Bodega Marisol'),('Bodega Marquez'),('Bodega Mirian'),('Bodega Moises'),('Bodega Nuñez'),('Bodega Samir'),('Bodega San Francisco'),('Bodega Shekina'),('Bodega Suazo'),('Bodega Umanzor S. de R.L. de C.V.'),('Boguedita Karlita'),('Cerveceria Hondureña S.A. de C.V.'),('Comercial Alis'),('Comercial Galvez'),('Comercial Handal'),('Comisariato Los Andes'),('Confitería Brayan'),('Confitería Emy S. de R.L.'),('Confiteria Las Acacias'),('Confiteria Michelle'),('Confiteria Nicolle #2'),('Confiteria Rey'),('Corporación La Cumbre'),('Cristian Isidro'),('Deposito Bella'),('Deposito German'),('Diprosar'),('Distr. Raul Rodriguez'),('Distribuidora y Surtidora Mi Isabel'),('Economax'),('Ecsa Fuels'),('El Mandadito Market'),('Embasadora de Granos Mejia'),('Frutas y Verduras Sharon'),('FuelMart BM S.A. de C.V.'),('INJAVI S,R.L.'),('Inversiones Beilyn S. de R.L.'),('Inversiones Eblin'),('Inversiones Las Dos D'),('Inversiones Lulu J.R.'),('Inversiones Monte de Sion'),('Inversiones Ramirez Muñoz'),('Inversiones S y E'),('Inversiones Tamarindo'),('INVERSIONES ZUNIGA'),('K Internacional S.A. de C.V.'),('La Confiteria No.1 S de R.L.'),('M/S Monte Carmel'),('Megasupro Morazan'),('Mercadito Denis'),('Mini Bodega Juan Carlos'),('Mini Super El Exito'),('Mini Super La Familia S. de R.L'),('Mini Super San Antonio'),('Minisuper El Exito'),('Minisuper R.H'),('MULTYPLAST'),('Operadora del Oriente (Walmart)'),('Pricemart Honduras SA de CV'),('Pricesmart Honduras SA de CV'),('Pul Daniel'),('Pulp. La Chiquita'),('Pulperia Alba Dania'),('Pulperia Caracol'),('Pulpería y Más La Económica'),('Puma Quimistan'),('Super Mercado Coquin S. de R.L.'),('Super Surtidora S de R.L'),('Supermercado Coquin S.de R.L.'),('Supermercado Dos Caminos'),('Supermercado El Económico'),('Supermercado El Exito S.A de C.V.'),('Supermercado La Económica S.A.'),('Supermercado La Roca'),('Supermercado Lider'),('Supermercado Marquez'),('Supermercado Ocotepeque'),('Supermercado Selecto S. de R.L.'),('Supermercado Shalom MI Super'),('Supermercado Toto S. de R.L.'),('Supermercado Yessenia'),('Supermercados La Roca'),('Supermercados Marquez'),('Supermercados Ocotepeque'),('Surtidora La Fe'),('Surtidora Portillo'),('Surtidora Sampedrana'),('Tu Supercito'),('Variedades Paz Rapalo') on conflict do nothing;
insert into public.liquidadoras(nombre) values ('Dania Espinal'),('Jessy Canales') on conflict do nothing;
-- Se conservan los consecutivos del Excel, sin importar sus registros.
insert into devoluciones_privado.consecutivos(fecha,numero) values ('2026-05-22',2),('2026-05-23',2),('2026-05-25',1),('2026-05-26',2),('2026-05-27',6),('2026-05-28',4),('2026-05-29',3),('2026-05-30',22),('2026-06-02',4),('2026-06-03',2),('2026-06-04',6),('2026-06-08',2),('2026-06-13',3),('2026-06-15',1),('2026-06-16',2),('2026-06-17',5),('2026-06-18',7),('2026-06-19',2),('2026-06-22',1),('2026-06-23',3),('2026-06-24',2),('2026-06-25',2),('2026-06-26',1),('2026-06-27',4),('2026-06-30',13),('2026-07-02',2),('2026-07-06',4),('2026-07-08',1),('2026-07-09',3),('2026-07-14',3),('2026-07-15',2),('2026-07-16',3),('2026-07-17',2),('2026-07-18',1),('2026-07-20',2),('2026-07-22',2),('2026-07-23',1),('2026-07-24',2),('2026-07-25',4),('2026-07-28',1),('2026-07-29',1),('2026-07-30',1),('2026-07-31',7),('2026-08-04',3),('2026-08-05',1),('2026-08-06',1),('2026-08-11',2),('2026-08-12',2),('2026-08-14',1),('2026-08-18',1),('2026-08-19',1),('2026-08-20',1),('2026-08-21',2),('2026-08-24',1),('2026-08-25',1),('2026-08-26',1),('2026-08-27',4),('2026-08-28',7),('2026-08-31',2),('2026-09-01',11),('2026-09-02',1),('2026-09-03',2),('2026-09-08',3),('2026-09-10',1),('2026-09-11',1),('2026-09-12',2),('2026-09-16',3),('2026-09-18',8),('2026-09-19',7),('2026-09-21',1),('2026-09-22',6),('2026-09-23',1),('2026-09-24',3),('2026-09-25',2),('2026-09-26',1),('2026-09-28',8),('2026-09-29',3),('2026-09-30',17),('2026-10-02',3),('2026-10-03',1),('2026-10-05',5),('2026-10-06',4),('2026-10-12',1),('2026-10-15',2),('2026-10-16',1),('2026-10-17',7),('2026-10-19',6) on conflict(fecha) do update set numero=greatest(devoluciones_privado.consecutivos.numero,excluded.numero);

commit;

