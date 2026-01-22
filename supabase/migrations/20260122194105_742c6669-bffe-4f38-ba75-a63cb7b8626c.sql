-- Create table for device sessions and trusted devices
CREATE TABLE public.tb_dispositivo (
  dispositivo_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.tb_usuario(user_id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  ip_address TEXT,
  location_country TEXT,
  location_state TEXT,
  location_city TEXT,
  device_type TEXT NOT NULL DEFAULT 'desktop', -- 'desktop', 'mobile', 'tablet'
  browser_name TEXT,
  os_name TEXT,
  login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  remember_until TIMESTAMP WITH TIME ZONE, -- If set, 2FA is skipped until this date
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id, device_token)
);

-- Enable RLS
ALTER TABLE public.tb_dispositivo ENABLE ROW LEVEL SECURITY;

-- Users can only see their own devices
CREATE POLICY "Users can view own devices"
ON public.tb_dispositivo
FOR SELECT
USING (true);

-- Allow insert for new devices
CREATE POLICY "Allow insert devices"
ON public.tb_dispositivo
FOR INSERT
WITH CHECK (true);

-- Allow update for device activity
CREATE POLICY "Allow update devices"
ON public.tb_dispositivo
FOR UPDATE
USING (true);

-- Allow delete devices
CREATE POLICY "Allow delete devices"
ON public.tb_dispositivo
FOR DELETE
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_dispositivo_user_id ON public.tb_dispositivo(user_id);
CREATE INDEX idx_dispositivo_device_token ON public.tb_dispositivo(device_token);