
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS assinatura_email_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-signatures', 'email-signatures', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Public read email signatures"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'email-signatures');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can upload email signatures"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'email-signatures');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can update email signatures"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'email-signatures');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can delete email signatures"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'email-signatures');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
