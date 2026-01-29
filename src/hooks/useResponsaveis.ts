import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Responsavel {
  responsavel_id: number;
  nome: string;
  cpf_numero: string;
  rg: string | null;
  end_id: number | null;
  telefone_principal: string | null;
  telefone_alternativo: string | null;
  email_principal: string | null;
  email_alternativo: string | null;
  endereco?: {
    logradouro: string;
    numero: string | null;
    complemento: string | null;
    bairro: string;
    cep: string;
    uf: string;
  } | null;
  empresas: EmpresaVinculada[];
}

export interface EmpresaVinculada {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
}

export function useResponsaveis() {
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResponsaveis = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("tb_responsavel")
        .select(`
          responsavel_id,
          nome,
          cpf_numero,
          rg,
          end_id,
          telefone_principal,
          telefone_alternativo,
          email_principal,
          email_alternativo,
          tb_endereco (
            logradouro,
            numero,
            complemento,
            bairro,
            cep,
            uf
          ),
          tb_responsavel_cnpj (
            cnpj_id,
            tb_cnpj (
              cnpj_id,
              razao_social,
              cnpj_numero
            )
          )
        `)
        .order("nome");

      if (fetchError) throw fetchError;

      const formattedData: Responsavel[] = (data || []).map((r: any) => ({
        responsavel_id: r.responsavel_id,
        nome: r.nome,
        cpf_numero: r.cpf_numero,
        rg: r.rg,
        end_id: r.end_id,
        telefone_principal: r.telefone_principal,
        telefone_alternativo: r.telefone_alternativo,
        email_principal: r.email_principal,
        email_alternativo: r.email_alternativo,
        endereco: r.tb_endereco || null,
        empresas: (r.tb_responsavel_cnpj || [])
          .filter((rel: any) => rel.tb_cnpj)
          .map((rel: any) => ({
            cnpj_id: rel.tb_cnpj.cnpj_id,
            razao_social: rel.tb_cnpj.razao_social,
            cnpj_numero: rel.tb_cnpj.cnpj_numero,
          })),
      }));

      setResponsaveis(formattedData);
    } catch (err: any) {
      console.error("Erro ao buscar responsáveis:", err);
      setError(err.message || "Erro ao carregar responsáveis");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResponsaveis();
  }, [fetchResponsaveis]);

  const addResponsavel = async (data: {
    nome: string;
    cpf_numero: string;
    rg?: string;
    telefone_principal?: string;
    telefone_alternativo?: string;
    email_principal?: string;
    email_alternativo?: string;
    endereco?: {
      logradouro: string;
      numero?: string;
      complemento?: string;
      bairro: string;
      cep: string;
      uf: string;
    };
    cnpj_ids?: number[];
  }) => {
    try {
      // Verificar se CPF já existe
      const { data: existing } = await supabase
        .from("tb_responsavel")
        .select("responsavel_id")
        .eq("cpf_numero", data.cpf_numero.replace(/\D/g, ""))
        .maybeSingle();

      if (existing) {
        return { success: false, error: "CPF já cadastrado" };
      }

      // Criar endereço se fornecido
      let endId: number | null = null;
      if (data.endereco && data.endereco.logradouro && data.endereco.bairro) {
        const { data: endData, error: endError } = await supabase
          .from("tb_endereco")
          .insert({
            logradouro: data.endereco.logradouro,
            numero: data.endereco.numero || null,
            complemento: data.endereco.complemento || null,
            bairro: data.endereco.bairro,
            cep: data.endereco.cep.replace(/\D/g, ""),
            uf: data.endereco.uf,
          })
          .select("end_id")
          .single();

        if (endError) throw endError;
        endId = endData.end_id;
      }

      // Criar responsável
      const { data: respData, error: respError } = await supabase
        .from("tb_responsavel")
        .insert({
          nome: data.nome,
          cpf_numero: data.cpf_numero.replace(/\D/g, ""),
          rg: data.rg || null,
          end_id: endId,
          telefone_principal: data.telefone_principal?.replace(/\D/g, "") || null,
          telefone_alternativo: data.telefone_alternativo?.replace(/\D/g, "") || null,
          email_principal: data.email_principal || null,
          email_alternativo: data.email_alternativo || null,
        })
        .select("responsavel_id")
        .single();

      if (respError) throw respError;

      // Criar vínculos com empresas
      if (data.cnpj_ids && data.cnpj_ids.length > 0) {
        const vinculos = data.cnpj_ids.map((cnpj_id) => ({
          responsavel_id: respData.responsavel_id,
          cnpj_id,
        }));

        const { error: vinculoError } = await supabase
          .from("tb_responsavel_cnpj")
          .insert(vinculos);

        if (vinculoError) throw vinculoError;
      }

      await fetchResponsaveis();
      return { success: true, responsavel_id: respData.responsavel_id };
    } catch (err: any) {
      console.error("Erro ao adicionar responsável:", err);
      return { success: false, error: err.message };
    }
  };

  const addVinculo = async (responsavelId: number, cnpjId: number) => {
    try {
      const { data: existing } = await supabase
        .from("tb_responsavel_cnpj")
        .select("id")
        .eq("responsavel_id", responsavelId)
        .eq("cnpj_id", cnpjId)
        .maybeSingle();

      if (existing) {
        return { success: false, error: "Vínculo já existe" };
      }

      const { error } = await supabase
        .from("tb_responsavel_cnpj")
        .insert({
          responsavel_id: responsavelId,
          cnpj_id: cnpjId,
        });

      if (error) throw error;

      await fetchResponsaveis();
      return { success: true };
    } catch (err: any) {
      console.error("Erro ao adicionar vínculo:", err);
      return { success: false, error: err.message };
    }
  };

  const removeVinculo = async (responsavelId: number, cnpjId: number) => {
    try {
      const { error } = await supabase
        .from("tb_responsavel_cnpj")
        .delete()
        .eq("responsavel_id", responsavelId)
        .eq("cnpj_id", cnpjId);

      if (error) throw error;

      await fetchResponsaveis();
      return { success: true };
    } catch (err: any) {
      console.error("Erro ao remover vínculo:", err);
      return { success: false, error: err.message };
    }
  };

  return {
    responsaveis,
    isLoading,
    error,
    refetch: fetchResponsaveis,
    addResponsavel,
    addVinculo,
    removeVinculo,
  };
}

// Funções auxiliares de formatação
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
