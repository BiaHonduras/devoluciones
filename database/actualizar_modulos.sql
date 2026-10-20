CREATE OR REPLACE FUNCTION devoluciones_privado.admin_vincular_usuario(p_auth_user_id uuid, p_usuario text, p_email text, p_nombre text, p_dni text, p_sede text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id integer; v_email text:=lower(trim(p_email)); v_sede text:=upper(trim(p_sede)); v_nombre_sede text;
begin
  if auth.uid() is null or not public.dev_puede_admin_usuarios() then raise exception 'SOLO_ADMINISTRADOR'; end if;
  if p_auth_user_id is null or not exists(select 1 from auth.users a where a.id=p_auth_user_id and lower(a.email)=v_email) then raise exception 'CUENTA_AUTH_NO_VALIDA'; end if;
  if trim(coalesce(p_usuario,'')) !~ '^[A-Za-z0-9._-]{2,60}$' or trim(coalesce(p_nombre,''))='' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'DATOS_DE_USUARIO_INVALIDOS'; end if;
  if p_dni is not null and trim(p_dni)<>'' and trim(p_dni) !~ '^[0-9]{13}$' then raise exception 'DNI_INVALIDO'; end if;
  select nombre into v_nombre_sede from public.sedes where codigo=v_sede;
  if v_nombre_sede is null or not (v_sede=any(public.obtener_sedes_usuario())) then raise exception 'SEDE_INVALIDA'; end if;
  if exists(select 1 from public.usuarios where lower(correo)=v_email or lower(usuario)=lower(trim(p_usuario))) then raise exception 'CORREO_O_USUARIO_YA_REGISTRADO'; end if;
  insert into public.usuarios(usuario,correo,rol,nombre_corto,dni,sede,auth_user_id,activo,must_change_password)
  values(trim(p_usuario),v_email,'user',trim(p_nombre),nullif(trim(coalesce(p_dni,'')),''),v_nombre_sede,p_auth_user_id,true,true) returning id into v_id;
  insert into public.usuarios_sedes(user_id,email,nombre,sede,rol,puede_cierre_dia,activo)
  values(p_auth_user_id,v_email,trim(p_nombre),v_sede,'consulta',false,true);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION devoluciones_privado.importar_historico(p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fila jsonb;
  v_gestion text;
  v_id uuid;
  v_count integer := 0;
  v_items integer;
  v_n1 integer;
  v_n2 integer;
  v_n4 integer;
  v_actor_nombre text;
begin
  if not public.dev_puede_admin_usuarios() then raise exception 'SOLO_ADMINISTRADOR'; end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 or jsonb_array_length(p_filas) > 10000 then
    raise exception 'ARCHIVO_VACIO_O_DEMASIADO_GRANDE';
  end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x where jsonb_typeof(x.value) <> 'object') then raise exception 'FORMATO_DE_FILA_INVALIDO'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x group by upper(trim(x.value->>'gestion')) having count(*) > 200) then raise exception 'GESTION_SUPERA_200_SKU'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x group by upper(trim(x.value->>'gestion')), trim(x.value->>'codigo') having count(*) > 1) then raise exception 'CODIGO_DUPLICADO_EN_GESTION'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x where coalesce(trim(x.value->>'gestion'),'') !~ '^DEV-[0-9]{8}-[0-9]{2,}$' or coalesce(trim(x.value->>'factura'),'')='' or coalesce(trim(x.value->>'codigo'),'')='' or coalesce(trim(x.value->>'cantidad'),'') !~ '^[0-9]+([.][0-9]{1,4})?$' or coalesce(trim(x.value->>'costo_unitario'),'') !~ '^[0-9]+([.][0-9]{1,4})?$') then raise exception 'CAMPOS_O_FORMATO_NUMERICO_INVALIDO'; end if;
  if exists(
    select 1 from (select distinct upper(trim(x.value->>'gestion')) gestion from jsonb_array_elements(p_filas) x) g
    where (select count(distinct (x.value->>'fecha_registro',x.value->>'sede',x.value->>'gestor_n1',x.value->>'gestor_n2',x.value->>'gestor_n4',x.value->>'liquidadora',x.value->>'factura',x.value->>'cliente',x.value->>'observacion',x.value->>'bodega_origen',x.value->>'bodega_destino',x.value->>'comentario',x.value->>'estado',x.value->>'fecha_entrega_liquidadora',x.value->>'fecha_nota_debito',x.value->>'fecha_ingreso_gp',x.value->>'fecha_finalizado')) from jsonb_array_elements(p_filas) x where upper(trim(x.value->>'gestion'))=g.gestion) <> 1
  ) then raise exception 'DATOS_DE_GESTION_NO_COINCIDEN_ENTRE_FILAS'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x left join public.sedes s on s.codigo=upper(trim(x.value->>'sede')) where s.codigo is null) then raise exception 'SEDE_INVALIDA'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x left join public.estados e on e.nombre=trim(x.value->>'estado') where e.nombre is null) then raise exception 'ESTADO_INVALIDO'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x left join public.negocio n on n.nombre=trim(x.value->>'cliente') where n.nombre is null) then raise exception 'CLIENTE_INVALIDO'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x left join public.observaciones o on o.nombre=trim(x.value->>'observacion') where o.nombre is null) then raise exception 'OBSERVACION_INVALIDA'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x left join public.codigos c on c.codigo=trim(x.value->>'codigo') where c.codigo is null) then raise exception 'CODIGO_NO_EXISTE'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x left join public.liquidadoras l on l.nombre= nullif(trim(x.value->>'liquidadora'),'') where nullif(trim(x.value->>'liquidadora'),'') is not null and l.nombre is null) then raise exception 'LIQUIDADORA_INVALIDA'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x where upper(trim(x.value->>'sede')) not in (select unnest(public.obtener_sedes_usuario()))) then raise exception 'SIN_ACCESO_A_SEDE'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x left join public.usuarios u on lower(u.correo)=lower(trim(x.value->>'gestor_n1')) and u.activo is true where u.id is null) then raise exception 'GESTOR_N1_INVALIDO'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x where nullif(trim(x.value->>'gestor_n2'),'') is not null and not exists(select 1 from public.usuarios u where lower(u.correo)=lower(trim(x.value->>'gestor_n2')) and u.activo is true)) then raise exception 'GESTOR_N2_INVALIDO'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x where nullif(trim(x.value->>'gestor_n4'),'') is not null and not exists(select 1 from public.usuarios u where lower(u.correo)=lower(trim(x.value->>'gestor_n4')) and u.activo is true)) then raise exception 'GESTOR_N4_INVALIDO'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x where nullif(trim(x.value->>'fecha_registro'),'') is null or (x.value->>'fecha_registro')::timestamptz is null) then raise exception 'FECHA_REGISTRO_INVALIDA'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x group by upper(trim(x.value->>'gestion')) having count(*) <> count(distinct trim(x.value->>'codigo'))) then raise exception 'CODIGO_DUPLICADO_EN_GESTION'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) x group by upper(trim(x.value->>'gestion')) having bool_or((x.value->>'fecha_registro')::timestamptz is null)) then raise exception 'FECHA_REGISTRO_INVALIDA'; end if;
  if exists(select 1 from (select distinct upper(trim(x.value->>'gestion')) gestion from jsonb_array_elements(p_filas) x) g join public.devoluciones d on d.gestion=g.gestion) then raise exception 'GESTION_YA_EXISTE'; end if;
  -- Serialize with live creation and advance historical daily sequences.
  for v_gestion in select distinct upper(trim(value->>'gestion')) from jsonb_array_elements(p_filas) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(v_gestion,0));
  end loop;
  v_actor_nombre := (select coalesce(u.nombre_corto,u.usuario) from public.usuarios u where u.auth_user_id=auth.uid() and u.activo limit 1);
  -- One parent record per management; its product rows are inserted together.
  for v_fila in select value from jsonb_array_elements(p_filas) loop
    if not exists(select 1 from public.devoluciones d where d.gestion=upper(trim(v_fila->>'gestion'))) then
      select id into v_n1 from public.usuarios where lower(correo)=lower(trim(v_fila->>'gestor_n1')) and activo;
      select id into v_n2 from public.usuarios where lower(correo)=lower(trim(v_fila->>'gestor_n2')) and activo;
      select id into v_n4 from public.usuarios where lower(correo)=lower(trim(v_fila->>'gestor_n4')) and activo;
      insert into public.devoluciones(solicitud_id,gestion,fecha_registro,sede,gestor_n1,gestor_n2,gestor_n4,liquidadora,factura,cliente,observacion,bodega_origen,bodega_destino,comentario,estado,fecha_entrega_liquidadora,fecha_nota_debito,fecha_ingreso_gp,fecha_finalizado,creado_por)
      values(gen_random_uuid(),upper(trim(v_fila->>'gestion')),(v_fila->>'fecha_registro')::timestamptz,upper(trim(v_fila->>'sede')),v_n1,v_n2,v_n4,nullif(trim(v_fila->>'liquidadora'),''),trim(v_fila->>'factura'),trim(v_fila->>'cliente'),trim(v_fila->>'observacion'),trim(v_fila->>'bodega_origen'),trim(v_fila->>'bodega_destino'),coalesce(v_fila->>'comentario',''),trim(v_fila->>'estado'),nullif(v_fila->>'fecha_entrega_liquidadora','')::timestamptz,nullif(v_fila->>'fecha_nota_debito','')::timestamptz,nullif(v_fila->>'fecha_ingreso_gp','')::timestamptz,nullif(v_fila->>'fecha_finalizado','')::timestamptz,auth.uid()) returning id into v_id;
      insert into public.devoluciones_detalle(devolucion_id,codigo,descripcion,cantidad,costo_unitario)
      select v_id,trim(x.value->>'codigo'),coalesce(nullif(trim(x.value->>'descripcion'),''),c.descripcion),(x.value->>'cantidad')::numeric,(x.value->>'costo_unitario')::numeric from jsonb_array_elements(p_filas) x join public.codigos c on c.codigo=trim(x.value->>'codigo') where upper(trim(x.value->>'gestion'))=upper(trim(v_fila->>'gestion'));
      insert into public.devoluciones_historial(devolucion_id,actor,actor_nombre,estado_nuevo,comentario) values(v_id,auth.uid(),coalesce(v_actor_nombre,''),trim(v_fila->>'estado'),'Importado desde histórico CSV');
      insert into devoluciones_privado.consecutivos(fecha,numero)
      values(to_date(substring(upper(trim(v_fila->>'gestion')) from 5 for 8),'DDMMYYYY'),split_part(v_fila->>'gestion','-',3)::integer)
      on conflict(fecha) do update set numero=greatest(devoluciones_privado.consecutivos.numero,excluded.numero);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('gestiones',v_count,'lineas',jsonb_array_length(p_filas));
end;
$function$;
