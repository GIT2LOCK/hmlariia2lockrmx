
-- Permitir uso do bucket ticket-attachments também para sessões anon
-- (mesmo padrão das tabelas de tickets que já possuem "Anon full access").
CREATE POLICY "Anon read ticket attachments"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'ticket-attachments');

CREATE POLICY "Anon upload ticket attachments"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'ticket-attachments');

CREATE POLICY "Anon update ticket attachments"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'ticket-attachments');

CREATE POLICY "Anon delete ticket attachments"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'ticket-attachments');
