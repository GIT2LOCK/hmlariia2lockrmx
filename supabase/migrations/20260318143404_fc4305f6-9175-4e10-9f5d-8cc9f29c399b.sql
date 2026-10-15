-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow anyone to view avatars
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

-- Allow users to update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'avatars');

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'avatars');

-- Add avatar_url and telefone columns to usuarios
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT NULL;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS telefone character varying DEFAULT NULL;