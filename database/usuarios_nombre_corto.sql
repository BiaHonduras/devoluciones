-- Add the canonical short name without changing existing consumers or site access.
create or replace function public.bia_list_users() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'email',s.email,'full_name',s.nombre,
 'nombre_corto',(select u.nombre_corto from public.usuarios u where u.auth_user_id=s.user_id order by u.id limit 1),
 'employee_code','','role',s.rol,'agency',s.sede,'is_active',s.activo,'created_at',s.created_at,'updated_at',s.updated_at)
 order by s.email,s.sede),'[]'::jsonb)
 from public.usuarios_sedes s where auth.uid() is not null and public.usuario_es_admin_sede(s.sede);
$$;
notify pgrst,'reload schema';
