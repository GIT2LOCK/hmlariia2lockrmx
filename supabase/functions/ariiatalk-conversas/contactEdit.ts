import { z } from "npm:zod@3.25.76";

export const contactEditSchema = z.object({
  contact_id: z.number().int().positive(),
  nome: z.string().trim().min(2).max(120).transform(v => v.replace(/\s+/g, " ")),
  telefone: z.string().max(30).transform(v => v.replace(/\D/g, "")).refine(v => !v || (v.length >= 10 && v.length <= 15)).transform(v => v || null),
  email: z.string().trim().max(254).refine(v => !v || z.string().email().safeParse(v).success).transform(v => v || null),
  categoria: z.string().trim().max(40).transform(v => v || null),
});

export function editedContactValues(input: z.infer<typeof contactEditSchema>, previousPhone: string | null) {
  return {
    nome: input.nome, telefone: input.telefone, email: input.email, categoria: input.categoria,
    ...(input.telefone !== previousPhone ? { foto_whatsapp_url: null, foto_whatsapp_consultada_em: null } : {}),
  };
}