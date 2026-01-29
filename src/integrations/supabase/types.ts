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
      sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          ip_address: string | null
          last_activity: string | null
          session_id: number
          token: string
          user_agent: string | null
          user_id: number
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          ip_address?: string | null
          last_activity?: string | null
          session_id?: number
          token: string
          user_agent?: string | null
          user_id: number
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          ip_address?: string | null
          last_activity?: string | null
          session_id?: number
          token?: string
          user_agent?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tb_usuario"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tb_categoria: {
        Row: {
          cat_id: number
          categoria: string
        }
        Insert: {
          cat_id?: number
          categoria: string
        }
        Update: {
          cat_id?: number
          categoria?: string
        }
        Relationships: []
      }
      tb_cnpj: {
        Row: {
          agencia: string | null
          casn: string | null
          cat_id: number | null
          ccm: string | null
          cnpj_id: number
          cnpj_numero: string
          email_id: number | null
          end_id: number | null
          razao_social: string
          responsavel_nome: string | null
          superior_cnpj: string | null
          tel_id: number | null
        }
        Insert: {
          agencia?: string | null
          casn?: string | null
          cat_id?: number | null
          ccm?: string | null
          cnpj_id?: number
          cnpj_numero: string
          email_id?: number | null
          end_id?: number | null
          razao_social: string
          responsavel_nome?: string | null
          superior_cnpj?: string | null
          tel_id?: number | null
        }
        Update: {
          agencia?: string | null
          casn?: string | null
          cat_id?: number | null
          ccm?: string | null
          cnpj_id?: number
          cnpj_numero?: string
          email_id?: number | null
          end_id?: number | null
          razao_social?: string
          responsavel_nome?: string | null
          superior_cnpj?: string | null
          tel_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tb_cnpj_endereco"
            columns: ["end_id"]
            isOneToOne: false
            referencedRelation: "tb_endereco"
            referencedColumns: ["end_id"]
          },
          {
            foreignKeyName: "tb_cnpj_cat_id_fkey"
            columns: ["cat_id"]
            isOneToOne: false
            referencedRelation: "tb_categoria"
            referencedColumns: ["cat_id"]
          },
          {
            foreignKeyName: "tb_cnpj_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "tb_email"
            referencedColumns: ["email_id"]
          },
          {
            foreignKeyName: "tb_cnpj_tel_id_fkey"
            columns: ["tel_id"]
            isOneToOne: false
            referencedRelation: "tb_numero"
            referencedColumns: ["tel_id"]
          },
        ]
      }
      tb_cpf: {
        Row: {
          cpf_id: number
          cpf_numero: string
          nome: string
        }
        Insert: {
          cpf_id?: number
          cpf_numero: string
          nome: string
        }
        Update: {
          cpf_id?: number
          cpf_numero?: string
          nome?: string
        }
        Relationships: []
      }
      tb_cpf_cnpj: {
        Row: {
          cnpj_id: number | null
          cpf_id: number
          id: number
        }
        Insert: {
          cnpj_id?: number | null
          cpf_id: number
          id?: number
        }
        Update: {
          cnpj_id?: number | null
          cpf_id?: number
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tb_cpf_cnpj_cnpj_id_fkey"
            columns: ["cnpj_id"]
            isOneToOne: false
            referencedRelation: "tb_cnpj"
            referencedColumns: ["cnpj_id"]
          },
          {
            foreignKeyName: "tb_cpf_cnpj_cpf_id_fkey"
            columns: ["cpf_id"]
            isOneToOne: false
            referencedRelation: "tb_cpf"
            referencedColumns: ["cpf_id"]
          },
        ]
      }
      tb_demanda: {
        Row: {
          cnpj_cpf_id: number
          dem_id: number
          descricao_tarefa: string
          prazo_fim: string
          prazo_inicio: string
          prioridade_id: number
          status_id: number
          tipodemanda_id: number | null
          titulo_demanda: string
          user_id: number | null
          via_id: number
        }
        Insert: {
          cnpj_cpf_id: number
          dem_id?: number
          descricao_tarefa: string
          prazo_fim: string
          prazo_inicio: string
          prioridade_id: number
          status_id: number
          tipodemanda_id?: number | null
          titulo_demanda: string
          user_id?: number | null
          via_id: number
        }
        Update: {
          cnpj_cpf_id?: number
          dem_id?: number
          descricao_tarefa?: string
          prazo_fim?: string
          prazo_inicio?: string
          prioridade_id?: number
          status_id?: number
          tipodemanda_id?: number | null
          titulo_demanda?: string
          user_id?: number | null
          via_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tb_demanda_cnpj_cpf_id_fkey1"
            columns: ["cnpj_cpf_id"]
            isOneToOne: false
            referencedRelation: "tb_cpf_cnpj"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_demanda_prioridade_id_fkey"
            columns: ["prioridade_id"]
            isOneToOne: false
            referencedRelation: "tb_prioridade"
            referencedColumns: ["prioridade_id"]
          },
          {
            foreignKeyName: "tb_demanda_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "tb_status"
            referencedColumns: ["status_id"]
          },
          {
            foreignKeyName: "tb_demanda_tipodemanda_id_fkey"
            columns: ["tipodemanda_id"]
            isOneToOne: false
            referencedRelation: "tb_tipodemanda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_demanda_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tb_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tb_demanda_via_id_fkey"
            columns: ["via_id"]
            isOneToOne: false
            referencedRelation: "tb_via"
            referencedColumns: ["via_id"]
          },
        ]
      }
      tb_dispositivo: {
        Row: {
          browser_name: string | null
          device_token: string
          device_type: string
          dispositivo_id: number
          ip_address: string | null
          is_active: boolean
          last_activity: string
          location_city: string | null
          location_country: string | null
          location_state: string | null
          login_at: string
          os_name: string | null
          remember_until: string | null
          user_id: number
        }
        Insert: {
          browser_name?: string | null
          device_token: string
          device_type?: string
          dispositivo_id?: number
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          login_at?: string
          os_name?: string | null
          remember_until?: string | null
          user_id: number
        }
        Update: {
          browser_name?: string | null
          device_token?: string
          device_type?: string
          dispositivo_id?: number
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          login_at?: string
          os_name?: string | null
          remember_until?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tb_dispositivo_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tb_usuario"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tb_email: {
        Row: {
          email_alternativo: string | null
          email_id: number
          email_principal: string | null
          email_secundario: string | null
          verificado: boolean
        }
        Insert: {
          email_alternativo?: string | null
          email_id?: number
          email_principal?: string | null
          email_secundario?: string | null
          verificado?: boolean
        }
        Update: {
          email_alternativo?: string | null
          email_id?: number
          email_principal?: string | null
          email_secundario?: string | null
          verificado?: boolean
        }
        Relationships: []
      }
      tb_endereco: {
        Row: {
          bairro: string
          cep: string
          cidade: string | null
          complemento: string | null
          end_id: number
          logradouro: string
          numero: string | null
          uf: string
        }
        Insert: {
          bairro: string
          cep: string
          cidade?: string | null
          complemento?: string | null
          end_id?: number
          logradouro: string
          numero?: string | null
          uf: string
        }
        Update: {
          bairro?: string
          cep?: string
          cidade?: string | null
          complemento?: string | null
          end_id?: number
          logradouro?: string
          numero?: string | null
          uf?: string
        }
        Relationships: []
      }
      tb_numero: {
        Row: {
          tel_id: number
          telefone_alternativo: string | null
          telefone_principal: string | null
          telefone_secundario: string | null
        }
        Insert: {
          tel_id?: number
          telefone_alternativo?: string | null
          telefone_principal?: string | null
          telefone_secundario?: string | null
        }
        Update: {
          tel_id?: number
          telefone_alternativo?: string | null
          telefone_principal?: string | null
          telefone_secundario?: string | null
        }
        Relationships: []
      }
      tb_permissao: {
        Row: {
          descricao: string | null
          nome: string
          permissao_id: number
        }
        Insert: {
          descricao?: string | null
          nome: string
          permissao_id?: number
        }
        Update: {
          descricao?: string | null
          nome?: string
          permissao_id?: number
        }
        Relationships: []
      }
      tb_prazo: {
        Row: {
          descricao: string
          id: number
          prazo_minutos: number
          tipo: number
        }
        Insert: {
          descricao: string
          id?: number
          prazo_minutos: number
          tipo: number
        }
        Update: {
          descricao?: string
          id?: number
          prazo_minutos?: number
          tipo?: number
        }
        Relationships: []
      }
      tb_prioridade: {
        Row: {
          prioridade_id: number
          prioridade_nivel: number
          prioridade_nome: string
        }
        Insert: {
          prioridade_id?: never
          prioridade_nivel: number
          prioridade_nome: string
        }
        Update: {
          prioridade_id?: never
          prioridade_nivel?: number
          prioridade_nome?: string
        }
        Relationships: []
      }
      tb_responsavel: {
        Row: {
          cpf_numero: string
          email_alternativo: string | null
          email_principal: string | null
          end_id: number | null
          nome: string
          responsavel_id: number
          rg: string | null
          telefone_alternativo: string | null
          telefone_principal: string | null
        }
        Insert: {
          cpf_numero: string
          email_alternativo?: string | null
          email_principal?: string | null
          end_id?: number | null
          nome: string
          responsavel_id?: number
          rg?: string | null
          telefone_alternativo?: string | null
          telefone_principal?: string | null
        }
        Update: {
          cpf_numero?: string
          email_alternativo?: string | null
          email_principal?: string | null
          end_id?: number | null
          nome?: string
          responsavel_id?: number
          rg?: string | null
          telefone_alternativo?: string | null
          telefone_principal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb_responsavel_end_id_fkey"
            columns: ["end_id"]
            isOneToOne: false
            referencedRelation: "tb_endereco"
            referencedColumns: ["end_id"]
          },
        ]
      }
      tb_responsavel_cnpj: {
        Row: {
          cnpj_id: number
          id: number
          responsavel_id: number
        }
        Insert: {
          cnpj_id: number
          id?: number
          responsavel_id: number
        }
        Update: {
          cnpj_id?: number
          id?: number
          responsavel_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tb_responsavel_cnpj_cnpj_id_fkey"
            columns: ["cnpj_id"]
            isOneToOne: false
            referencedRelation: "tb_cnpj"
            referencedColumns: ["cnpj_id"]
          },
          {
            foreignKeyName: "tb_responsavel_cnpj_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "tb_responsavel"
            referencedColumns: ["responsavel_id"]
          },
        ]
      }
      tb_status: {
        Row: {
          status_id: number
          status_nome: string
        }
        Insert: {
          status_id?: never
          status_nome: string
        }
        Update: {
          status_id?: never
          status_nome?: string
        }
        Relationships: []
      }
      tb_tipodemanda: {
        Row: {
          id: number
          nome: string
          prazo_id: number
          tipo: number
        }
        Insert: {
          id?: number
          nome: string
          prazo_id: number
          tipo: number
        }
        Update: {
          id?: number
          nome?: string
          prazo_id?: number
          tipo?: number
        }
        Relationships: [
          {
            foreignKeyName: "tb_tipodemanda_prazo_id_fkey"
            columns: ["prazo_id"]
            isOneToOne: false
            referencedRelation: "tb_prazo"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_usuario: {
        Row: {
          atendente: boolean
          ativo: boolean | null
          avatar_url: string | null
          cpf_id: number
          data_criacao: string | null
          email_id: number
          email_verificado: boolean
          email_verification_expires: string | null
          email_verification_token: string | null
          last_verification_attempt: string | null
          nome: string
          permissao_id: number
          senha: string
          totp_enabled: boolean
          totp_secret: string | null
          user_id: number
          verification_attempts: number | null
        }
        Insert: {
          atendente?: boolean
          ativo?: boolean | null
          avatar_url?: string | null
          cpf_id: number
          data_criacao?: string | null
          email_id: number
          email_verificado?: boolean
          email_verification_expires?: string | null
          email_verification_token?: string | null
          last_verification_attempt?: string | null
          nome: string
          permissao_id: number
          senha: string
          totp_enabled?: boolean
          totp_secret?: string | null
          user_id?: number
          verification_attempts?: number | null
        }
        Update: {
          atendente?: boolean
          ativo?: boolean | null
          avatar_url?: string | null
          cpf_id?: number
          data_criacao?: string | null
          email_id?: number
          email_verificado?: boolean
          email_verification_expires?: string | null
          email_verification_token?: string | null
          last_verification_attempt?: string | null
          nome?: string
          permissao_id?: number
          senha?: string
          totp_enabled?: boolean
          totp_secret?: string | null
          user_id?: number
          verification_attempts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tb_usuario_cpf_id_fkey"
            columns: ["cpf_id"]
            isOneToOne: true
            referencedRelation: "tb_cpf"
            referencedColumns: ["cpf_id"]
          },
          {
            foreignKeyName: "tb_usuario_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "tb_email"
            referencedColumns: ["email_id"]
          },
          {
            foreignKeyName: "tb_usuario_permissao_id_fkey"
            columns: ["permissao_id"]
            isOneToOne: false
            referencedRelation: "tb_permissao"
            referencedColumns: ["permissao_id"]
          },
        ]
      }
      tb_via: {
        Row: {
          tem_email: boolean | null
          tem_whatsapp: boolean | null
          via_id: number
        }
        Insert: {
          tem_email?: boolean | null
          tem_whatsapp?: boolean | null
          via_id?: number
        }
        Update: {
          tem_email?: boolean | null
          tem_whatsapp?: boolean | null
          via_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atualizar_prioridade_demandas_excedidas: {
        Args: never
        Returns: undefined
      }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      get_user_permission: { Args: { user_id_param: number }; Returns: number }
      validate_session: { Args: { session_token: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
