import { useState, useCallback } from "react";

interface CepData {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
}

interface UseCepLookupResult {
  isLoading: boolean;
  error: string | null;
  fetchCep: (cep: string) => Promise<CepData | null>;
}

export function useCepLookup(): UseCepLookupResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCep = useCallback(async (cep: string): Promise<CepData | null> => {
    const cleanCep = cep.replace(/\D/g, "");
    
    if (cleanCep.length !== 8) {
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError("CEP não encontrado");
        } else {
          setError("Erro ao buscar CEP");
        }
        return null;
      }

      const data = await response.json();
      
      return {
        cep: data.cep,
        state: data.state,
        city: data.city,
        neighborhood: data.neighborhood || "",
        street: data.street || "",
      };
    } catch (err) {
      console.error("Erro ao buscar CEP:", err);
      setError("Erro ao buscar CEP");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, error, fetchCep };
}
