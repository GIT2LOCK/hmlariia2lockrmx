import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Pessoa {
  cpf_id: number;
  nome: string;
  cpf_numero: string;
  vinculos: Vinculo[];
}

export interface Vinculo {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
}

export function usePessoas() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPessoas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Buscar todas as pessoas (CPFs) com seus vínculos
      // Filtrar CPFs placeholder (números sequenciais ou todos zeros)
      const { data: cpfData, error: cpfError } = await supabase
        .from("tb_cpf")
        .select(`
          cpf_id,
          nome,
          cpf_numero,
          tb_cpf_cnpj (
            cnpj_id,
            tb_cnpj (
              cnpj_id,
              razao_social,
              cnpj_numero
            )
          )
        `)
        .order("nome");

      if (cpfError) throw cpfError;

      // Filtrar apenas pessoas físicas reais (CPFs válidos, não placeholders)
      // Placeholders são: "00000000000", números sequenciais curtos, etc.
      const isPlaceholderCpf = (cpf: string) => {
        const digits = cpf.replace(/\D/g, "");
        // CPF deve ter 11 dígitos
        if (digits.length !== 11) return true;
        // Verificar se é placeholder (todos zeros ou número sequencial pequeno)
        if (/^0+$/.test(digits)) return true;
        // Números menores que 100 são placeholders de empresa
        const numValue = parseInt(digits, 10);
        if (numValue < 100) return true;
        // CPFs inválidos com todos dígitos iguais
        if (/^(\d)\1+$/.test(digits)) return true;
        return false;
      };

      // Formatar os dados, excluindo placeholders
      const formattedPessoas: Pessoa[] = (cpfData || [])
        .filter((cpf: any) => !isPlaceholderCpf(cpf.cpf_numero))
        .map((cpf: any) => ({
          cpf_id: cpf.cpf_id,
          nome: cpf.nome,
          cpf_numero: cpf.cpf_numero,
          vinculos: (cpf.tb_cpf_cnpj || [])
            .filter((rel: any) => rel.tb_cnpj)
            .map((rel: any) => ({
              cnpj_id: rel.tb_cnpj.cnpj_id,
              razao_social: rel.tb_cnpj.razao_social,
              cnpj_numero: rel.tb_cnpj.cnpj_numero,
            })),
        }));

      setPessoas(formattedPessoas);
    } catch (err: any) {
      console.error("Error fetching pessoas:", err);
      setError(err.message || "Erro ao carregar pessoas");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPessoas();
  }, [fetchPessoas]);

  const addPessoa = async (nome: string, cpfNumero: string) => {
    try {
      // Verificar se o CPF já existe
      const { data: existing } = await supabase
        .from("tb_cpf")
        .select("cpf_id")
        .eq("cpf_numero", cpfNumero.replace(/\D/g, ""))
        .maybeSingle();

      if (existing) {
        return { success: false, error: "CPF já cadastrado" };
      }

      const { data, error } = await supabase
        .from("tb_cpf")
        .insert({
          nome,
          cpf_numero: cpfNumero.replace(/\D/g, ""),
        })
        .select("cpf_id")
        .single();

      if (error) throw error;

      await fetchPessoas();
      return { success: true, cpf_id: data.cpf_id };
    } catch (err: any) {
      console.error("Error adding pessoa:", err);
      return { success: false, error: err.message };
    }
  };

  const addVinculo = async (cpfId: number, cnpjId: number) => {
    try {
      // Verificar se o vínculo já existe
      const { data: existing } = await supabase
        .from("tb_cpf_cnpj")
        .select("id")
        .eq("cpf_id", cpfId)
        .eq("cnpj_id", cnpjId)
        .maybeSingle();

      if (existing) {
        return { success: false, error: "Vínculo já existe" };
      }

      const { error } = await supabase
        .from("tb_cpf_cnpj")
        .insert({
          cpf_id: cpfId,
          cnpj_id: cnpjId,
        });

      if (error) throw error;

      await fetchPessoas();
      return { success: true };
    } catch (err: any) {
      console.error("Error adding vinculo:", err);
      return { success: false, error: err.message };
    }
  };

  return {
    pessoas,
    isLoading,
    error,
    refetch: fetchPessoas,
    addPessoa,
    addVinculo,
  };
}

// Helper function to format CPF
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Helper function to format CNPJ
export function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
