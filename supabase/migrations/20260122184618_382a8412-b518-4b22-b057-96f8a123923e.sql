-- Delete all users except SUPERADMIN (Ewerton Melo, user_id = 8)
-- First, get the email_id and cpf_id of users to be deleted
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT user_id, email_id, cpf_id 
    FROM public.tb_usuario 
    WHERE user_id != 8
  LOOP
    -- Delete user first
    DELETE FROM public.tb_usuario WHERE user_id = user_record.user_id;
    
    -- Delete associated email
    IF user_record.email_id IS NOT NULL THEN
      DELETE FROM public.tb_email WHERE email_id = user_record.email_id;
    END IF;
    
    -- Delete associated CPF
    IF user_record.cpf_id IS NOT NULL THEN
      DELETE FROM public.tb_cpf WHERE cpf_id = user_record.cpf_id;
    END IF;
  END LOOP;
END $$;