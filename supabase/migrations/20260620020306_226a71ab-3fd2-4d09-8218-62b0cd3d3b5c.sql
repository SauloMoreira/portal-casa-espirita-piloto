create or replace function public.lista_usuarios_email()
returns table (
  user_id uuid,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select id as user_id, email::text from auth.users;
$$;

grant execute on function public.lista_usuarios_email() to authenticated;