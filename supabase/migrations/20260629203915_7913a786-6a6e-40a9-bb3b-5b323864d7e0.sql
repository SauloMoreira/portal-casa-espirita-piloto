-- S1 Lote 2: Endurecimento da superfície de storage (lint 0025)
-- O bucket público "avatars" tinha uma policy SELECT ampla para o papel `public`
-- (bucket_id = 'avatars'), permitindo que qualquer cliente LISTASSE todos os arquivos
-- e enumerasse pastas (nomeadas por UID de usuário = enumeração de PII).
--
-- A exibição pública das imagens usa o endpoint /object/public/ (getPublicUrl),
-- que para buckets públicos ignora RLS. Nenhum código usa storage.list().
-- Portanto, remover a policy SELECT ampla elimina a listagem pública sem impacto
-- na exibição de imagens, uploads ou visualização pública.

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Leitura autenticada do próprio avatar permanece possível via endpoint público;
-- a listagem fica disponível apenas para o dono (defesa em profundidade caso algum
-- fluxo autenticado precise listar a própria pasta no futuro).
CREATE POLICY "Users can list their own avatar folder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );