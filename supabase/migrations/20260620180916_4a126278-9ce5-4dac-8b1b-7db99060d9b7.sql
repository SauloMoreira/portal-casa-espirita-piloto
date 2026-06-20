INSERT INTO public.assistidos (nome, email, status, created_by, user_id, quantidade_palestras)
SELECT 'Usuario Teste', u.email, 'ativo', u.id, u.id, 0
FROM auth.users u
WHERE u.email = 'u@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.assistidos a WHERE a.user_id = u.id);