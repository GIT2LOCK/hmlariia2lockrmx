import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Usuario {
  user_id: number;
  nome: string;
  email: string;
  cpf: string;
  permissao_id: number;
  permissao_nome: string;
  permissao_descricao: string;
  ativo: boolean;
  email_verificado: boolean;
  totp_enabled: boolean;
  data_criacao: string;
}

export interface Permissao {
  permissao_id: number;
  nome: string;
  descricao: string;
  membros: number;
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsuarios = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from("tb_usuario")
        .select(`
          user_id,
          nome,
          ativo,
          email_verificado,
          totp_enabled,
          data_criacao,
          permissao_id,
          tb_permissao!inner (nome, descricao),
          tb_email!inner (email_principal),
          tb_cpf!inner (cpf_numero)
        `)
        .order("user_id");

      if (fetchError) {
        throw fetchError;
      }

      const formattedUsers: Usuario[] = (data || []).map((user: any) => ({
        user_id: user.user_id,
        nome: user.nome,
        email: user.tb_email?.email_principal || "",
        cpf: formatCpf(user.tb_cpf?.cpf_numero || ""),
        permissao_id: user.permissao_id,
        permissao_nome: user.tb_permissao?.nome || "VIEWER",
        permissao_descricao: user.tb_permissao?.descricao || "",
        ativo: user.ativo,
        email_verificado: user.email_verificado,
        totp_enabled: user.totp_enabled,
        data_criacao: user.data_criacao,
      }));

      setUsuarios(formattedUsers);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError(err.message || "Erro ao carregar usuários");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const toggleUsuarioAtivo = async (userId: number, ativo: boolean) => {
    try {
      const { error: updateError } = await supabase
        .from("tb_usuario")
        .update({ ativo })
        .eq("user_id", userId);

      if (updateError) throw updateError;

      setUsuarios((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, ativo } : u))
      );
      return { success: true };
    } catch (err: any) {
      console.error("Error toggling user status:", err);
      return { success: false, error: err.message };
    }
  };

  const updateUsuarioPermissao = async (userId: number, permissaoId: number) => {
    try {
      const { error: updateError } = await supabase
        .from("tb_usuario")
        .update({ permissao_id: permissaoId })
        .eq("user_id", userId);

      if (updateError) throw updateError;

      // Refresh to get updated permission name
      await fetchUsuarios();
      return { success: true };
    } catch (err: any) {
      console.error("Error updating user permission:", err);
      return { success: false, error: err.message };
    }
  };

  const deleteUsuario = async (userId: number) => {
    try {
      // Get user's email_id and cpf_id first
      const { data: userData } = await supabase
        .from("tb_usuario")
        .select("email_id, cpf_id")
        .eq("user_id", userId)
        .single();

      if (!userData) throw new Error("Usuário não encontrado");

      // Delete user first
      const { error: deleteUserError } = await supabase
        .from("tb_usuario")
        .delete()
        .eq("user_id", userId);

      if (deleteUserError) throw deleteUserError;

      // Delete associated email and cpf
      if (userData.email_id) {
        await supabase.from("tb_email").delete().eq("email_id", userData.email_id);
      }
      if (userData.cpf_id) {
        await supabase.from("tb_cpf").delete().eq("cpf_id", userData.cpf_id);
      }

      setUsuarios((prev) => prev.filter((u) => u.user_id !== userId));
      return { success: true };
    } catch (err: any) {
      console.error("Error deleting user:", err);
      return { success: false, error: err.message };
    }
  };

  return {
    usuarios,
    isLoading,
    error,
    refetch: fetchUsuarios,
    toggleUsuarioAtivo,
    updateUsuarioPermissao,
    deleteUsuario,
  };
}

export function usePermissoes() {
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissoes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get permissions
      const { data: permData, error: permError } = await supabase
        .from("tb_permissao")
        .select("*")
        .order("permissao_id");

      if (permError) throw permError;

      // Get member count for each permission
      const { data: countData, error: countError } = await supabase
        .from("tb_usuario")
        .select("permissao_id");

      if (countError) throw countError;

      // Count members per permission
      const memberCounts: Record<number, number> = {};
      (countData || []).forEach((user: any) => {
        memberCounts[user.permissao_id] = (memberCounts[user.permissao_id] || 0) + 1;
      });

      const formattedPermissoes: Permissao[] = (permData || []).map((perm: any) => ({
        permissao_id: perm.permissao_id,
        nome: perm.nome,
        descricao: perm.descricao || "",
        membros: memberCounts[perm.permissao_id] || 0,
      }));

      setPermissoes(formattedPermissoes);
    } catch (err: any) {
      console.error("Error fetching permissions:", err);
      setError(err.message || "Erro ao carregar permissões");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissoes();
  }, [fetchPermissoes]);

  return {
    permissoes,
    isLoading,
    error,
    refetch: fetchPermissoes,
  };
}

// Helper function to format CPF
function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
