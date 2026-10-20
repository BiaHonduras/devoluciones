begin;
create or replace function devoluciones_privado.agregar_catalogo(p_tipo text,p_nombre text)
returns text language plpgsql security definer set search_path='' as $$
declare v_nombre text:=regexp_replace(trim(coalesce(p_nombre,'')),'[[:space:]]+',' ','g'); v_existente text;
begin
 if auth.uid() is null or not devoluciones_privado.autorizado() or not exists(select 1 from public.sedes s where public.usuario_puede_sede(s.codigo)) then raise exception 'No tienes acceso para agregar registros.'; end if;
 if p_tipo is null or p_tipo not in ('cliente','comentario') then raise exception 'Tipo de catálogo no válido.'; end if;
 if length(v_nombre) not between 1 and 200 then raise exception 'Escribe entre 1 y 200 caracteres.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dev_catalogo:'||p_tipo,0));
 if p_tipo='cliente' then
  select nombre into v_existente from public.negocio where lower(nombre)=lower(v_nombre) order by nombre limit 1;
  if v_existente is not null then return v_existente; end if;
  insert into public.negocio(nombre) values(v_nombre);
 else
  select nombre into v_existente from public.observaciones where lower(nombre)=lower(v_nombre) order by nombre limit 1;
  if v_existente is not null then return v_existente; end if;
  insert into public.observaciones(nombre) values(v_nombre);
 end if;
 return v_nombre;
end $$;
revoke all on function devoluciones_privado.agregar_catalogo(text,text) from public,anon;
grant execute on function devoluciones_privado.agregar_catalogo(text,text) to authenticated;
create or replace function public.dev_agregar_catalogo(p_tipo text,p_nombre text)
returns text language sql security invoker set search_path='' as $$ select devoluciones_privado.agregar_catalogo(p_tipo,p_nombre); $$;
revoke all on function public.dev_agregar_catalogo(text,text) from public,anon;
grant execute on function public.dev_agregar_catalogo(text,text) to authenticated;
commit;
