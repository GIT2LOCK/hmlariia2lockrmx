export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cobertura_unidade: {
        Row: {
          criado_em: string | null
          descricao: string | null
          id: number
          tipo: string | null
          unidade_id: number
        }
        Insert: {
          criado_em?: string | null
          descricao?: string | null
          id?: number
          tipo?: string | null
          unidade_id: number
        }
        Update: {
          criado_em?: string | null
          descricao?: string | null
          id?: number
          tipo?: string | null
          unidade_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobertura_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dados_abertura_chamado: {
        Row: {
          atualizado_em: string | null
          cnpj_abertura: string | null
          criado_em: string | null
          email_abertura: string | null
          id: number
          link_id: number
          numero_cliente: string | null
          numero_contrato: string | null
          observacoes_abertura: string | null
          razao_social_abertura: string | null
          telefone_abertura: string | null
        }
        Insert: {
          atualizado_em?: string | null
          cnpj_abertura?: string | null
          criado_em?: string | null
          email_abertura?: string | null
          id?: number
          link_id: number
          numero_cliente?: string | null
          numero_contrato?: string | null
          observacoes_abertura?: string | null
          razao_social_abertura?: string | null
          telefone_abertura?: string | null
        }
        Update: {
          atualizado_em?: string | null
          cnpj_abertura?: string | null
          criado_em?: string | null
          email_abertura?: string | null
          id?: number
          link_id?: number
          numero_cliente?: string | null
          numero_contrato?: string | null
          observacoes_abertura?: string | null
          razao_social_abertura?: string | null
          telefone_abertura?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dados_abertura_chamado_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links_internet"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          atualizado_em: string | null
          cnpj: string | null
          criado_em: string | null
          id: number
          nome_fantasia: string
          observacoes: string | null
          razao_social: string | null
        }
        Insert: {
          atualizado_em?: string | null
          cnpj?: string | null
          criado_em?: string | null
          id?: number
          nome_fantasia: string
          observacoes?: string | null
          razao_social?: string | null
        }
        Update: {
          atualizado_em?: string | null
          cnpj?: string | null
          criado_em?: string | null
          id?: number
          nome_fantasia?: string
          observacoes?: string | null
          razao_social?: string | null
        }
        Relationships: []
      }
      links_internet: {
        Row: {
          atualizado_em: string | null
          bridge: boolean | null
          canal_atendimento: string | null
          criado_em: string | null
          ddns: string | null
          finalidade: Database["public"]["Enums"]["finalidade_link"] | null
          id: number
          ip_tipo: Database["public"]["Enums"]["ip_tipo"] | null
          ip_visibilidade: Database["public"]["Enums"]["ip_visibilidade"] | null
          nome_link: string | null
          observacoes: string | null
          operadora_id: number
          telefone_operadora: string | null
          tipo_conexao: string | null
          tipo_link: Database["public"]["Enums"]["tipo_link"] | null
          unidade_id: number
          velocidade_download: string | null
          velocidade_upload: string | null
        }
        Insert: {
          atualizado_em?: string | null
          bridge?: boolean | null
          canal_atendimento?: string | null
          criado_em?: string | null
          ddns?: string | null
          finalidade?: Database["public"]["Enums"]["finalidade_link"] | null
          id?: number
          ip_tipo?: Database["public"]["Enums"]["ip_tipo"] | null
          ip_visibilidade?:
            | Database["public"]["Enums"]["ip_visibilidade"]
            | null
          nome_link?: string | null
          observacoes?: string | null
          operadora_id: number
          telefone_operadora?: string | null
          tipo_conexao?: string | null
          tipo_link?: Database["public"]["Enums"]["tipo_link"] | null
          unidade_id: number
          velocidade_download?: string | null
          velocidade_upload?: string | null
        }
        Update: {
          atualizado_em?: string | null
          bridge?: boolean | null
          canal_atendimento?: string | null
          criado_em?: string | null
          ddns?: string | null
          finalidade?: Database["public"]["Enums"]["finalidade_link"] | null
          id?: number
          ip_tipo?: Database["public"]["Enums"]["ip_tipo"] | null
          ip_visibilidade?:
            | Database["public"]["Enums"]["ip_visibilidade"]
            | null
          nome_link?: string | null
          observacoes?: string | null
          operadora_id?: number
          telefone_operadora?: string | null
          tipo_conexao?: string | null
          tipo_link?: Database["public"]["Enums"]["tipo_link"] | null
          unidade_id?: number
          velocidade_download?: string | null
          velocidade_upload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "links_internet_operadora_id_fkey"
            columns: ["operadora_id"]
            isOneToOne: false
            referencedRelation: "operadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_internet_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      operadoras: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          email: string | null
          id: number
          nome: string
          observacoes: string | null
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          email?: string | null
          id?: number
          nome: string
          observacoes?: string | null
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          email?: string | null
          id?: number
          nome?: string
          observacoes?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          criado_em: string | null
          expires_at: string
          id: number
          ip_address: string | null
          last_activity: string | null
          token: string
          user_agent: string | null
          user_id: number
        }
        Insert: {
          criado_em?: string | null
          expires_at: string
          id?: number
          ip_address?: string | null
          last_activity?: string | null
          token: string
          user_agent?: string | null
          user_id: number
        }
        Update: {
          criado_em?: string | null
          expires_at?: string
          id?: number
          ip_address?: string | null
          last_activity?: string | null
          token?: string
          user_agent?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          abreviacao: string | null
          antiga_razao: string | null
          atualizado_em: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          codigo_unidade: string | null
          complemento: string | null
          contato_nome: string | null
          criado_em: string | null
          email: string | null
          email_regional: string | null
          empresa_id: number
          estado: string | null
          hostname: string | null
          id: number
          logradouro: string | null
          nome_antigo: string | null
          nome_unidade: string
          numero: string | null
          observacoes: string | null
          rede_default: string | null
          telefone: string | null
          wifi_antenas: boolean | null
        }
        Insert: {
          abreviacao?: string | null
          antiga_razao?: string | null
          atualizado_em?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_unidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          criado_em?: string | null
          email?: string | null
          email_regional?: string | null
          empresa_id: number
          estado?: string | null
          hostname?: string | null
          id?: number
          logradouro?: string | null
          nome_antigo?: string | null
          nome_unidade: string
          numero?: string | null
          observacoes?: string | null
          rede_default?: string | null
          telefone?: string | null
          wifi_antenas?: boolean | null
        }
        Update: {
          abreviacao?: string | null
          antiga_razao?: string | null
          atualizado_em?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_unidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          criado_em?: string | null
          email?: string | null
          email_regional?: string | null
          empresa_id?: number
          estado?: string | null
          hostname?: string | null
          id?: number
          logradouro?: string | null
          nome_antigo?: string | null
          nome_unidade?: string
          numero?: string | null
          observacoes?: string | null
          rede_default?: string | null
          telefone?: string | null
          wifi_antenas?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          email: string
          id: number
          nome: string
          permissao: string
          senha_hash: string
          totp_enabled: boolean | null
          totp_secret: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          email: string
          id?: number
          nome: string
          permissao?: string
          senha_hash: string
          totp_enabled?: boolean | null
          totp_secret?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          email?: string
          id?: number
          nome?: string
          permissao?: string
          senha_hash?: string
          totp_enabled?: boolean | null
          totp_secret?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      finalidade_link: "principal" | "backup"
      ip_tipo: "dinamico" | "fixo"
      ip_visibilidade: "publico" | "privado"
      tipo_link: "banda_larga" | "link_dedicado" | "4g" | "mpls"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      finalidade_link: ["principal", "backup"],
      ip_tipo: ["dinamico", "fixo"],
      ip_visibilidade: ["publico", "privado"],
      tipo_link: ["banda_larga", "link_dedicado", "4g", "mpls"],
    },
  },
} as const
