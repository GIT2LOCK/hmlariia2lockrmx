import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FilterState } from "@/components/DemandaFilters";

export interface FiltroFavorito {
  id: number;
  user_id: number;
  nome: string;
  filtros: FilterState;
  created_at: string;
}

export function useFiltrosFavoritos(userId: number | null) {
  const [favoritos, setFavoritos] = useState<FiltroFavorito[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchFavoritos = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("tb_filtro_favorito")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Parse filtros from JSONB and handle date conversion
      const parsed = (data || []).map((item) => {
        const filtrosJson = item.filtros as Record<string, unknown>;
        return {
          ...item,
          filtros: {
            dataInicio: filtrosJson.dataInicio ? new Date(filtrosJson.dataInicio as string) : undefined,
            dataFim: filtrosJson.dataFim ? new Date(filtrosJson.dataFim as string) : undefined,
            responsavelId: (filtrosJson.responsavelId as string) || "todos",
            empresaId: (filtrosJson.empresaId as string) || "todos",
            prioridadeId: (filtrosJson.prioridadeId as string) || "todos",
            statusId: (filtrosJson.statusId as string) || "todos",
            tipoDemandaId: (filtrosJson.tipoDemandaId as string) || "todos",
          } as FilterState,
        };
      });

      setFavoritos(parsed);
    } catch (error) {
      console.error("Erro ao carregar filtros favoritos:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFavoritos();
  }, [fetchFavoritos]);

  const salvarFavorito = async (nome: string, filtros: FilterState): Promise<boolean> => {
    if (!userId) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado",
        variant: "destructive",
      });
      return false;
    }

    try {
      // Convert dates to ISO strings for storage
      const filtrosParaSalvar = {
        ...filtros,
        dataInicio: filtros.dataInicio?.toISOString() || null,
        dataFim: filtros.dataFim?.toISOString() || null,
      };

      const { error } = await supabase
        .from("tb_filtro_favorito")
        .insert({
          user_id: userId,
          nome,
          filtros: filtrosParaSalvar,
        });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Filtro salvo como favorito",
      });

      await fetchFavoritos();
      return true;
    } catch (error) {
      console.error("Erro ao salvar filtro favorito:", error);
      toast({
        title: "Erro",
        description: "Falha ao salvar filtro favorito",
        variant: "destructive",
      });
      return false;
    }
  };

  const removerFavorito = async (id: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("tb_filtro_favorito")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Filtro favorito removido",
      });

      await fetchFavoritos();
      return true;
    } catch (error) {
      console.error("Erro ao remover filtro favorito:", error);
      toast({
        title: "Erro",
        description: "Falha ao remover filtro favorito",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    favoritos,
    isLoading,
    salvarFavorito,
    removerFavorito,
    refetch: fetchFavoritos,
  };
}
