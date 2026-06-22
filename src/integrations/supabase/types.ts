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
      chamados: {
        Row: {
          aberto_por: string | null
          atualizado_em: string | null
          codigo_servico: string | null
          criado_em: string | null
          id: number
          link_id: number
          protocolo: string
          unidade_id: number
        }
        Insert: {
          aberto_por?: string | null
          atualizado_em?: string | null
          codigo_servico?: string | null
          criado_em?: string | null
          id?: number
          link_id: number
          protocolo: string
          unidade_id: number
        }
        Update: {
          aberto_por?: string | null
          atualizado_em?: string | null
          codigo_servico?: string | null
          criado_em?: string | null
          id?: number
          link_id?: number
          protocolo?: string
          unidade_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "chamados_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links_internet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamados_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
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
      contato_unidades: {
        Row: {
          contato_id: number
          criado_em: string
          id: number
          unidade_id: number
        }
        Insert: {
          contato_id: number
          criado_em?: string
          id?: number
          unidade_id: number
        }
        Update: {
          contato_id?: number
          criado_em?: string
          id?: number
          unidade_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "contato_unidades_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contato_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          atualizado_em: string | null
          cobre_empresa_inteira: boolean
          criado_em: string | null
          email: string | null
          empresa_id: number | null
          id: number
          nome: string
          telefone: string | null
          tipo: Database["public"]["Enums"]["tipo_contato"]
          unidade_id: number | null
        }
        Insert: {
          atualizado_em?: string | null
          cobre_empresa_inteira?: boolean
          criado_em?: string | null
          email?: string | null
          empresa_id?: number | null
          id?: number
          nome: string
          telefone?: string | null
          tipo: Database["public"]["Enums"]["tipo_contato"]
          unidade_id?: number | null
        }
        Update: {
          atualizado_em?: string | null
          cobre_empresa_inteira?: boolean
          criado_em?: string | null
          email?: string | null
          empresa_id?: number | null
          id?: number
          nome?: string
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["tipo_contato"]
          unidade_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_unidade_id_fkey"
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
          designacao: string | null
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
          designacao?: string | null
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
          designacao?: string | null
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
      domain_rules: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          default_permissao: string
          domain: string
          empresa_id: number | null
          id: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          default_permissao?: string
          domain: string
          empresa_id?: number | null
          id?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          default_permissao?: string
          domain?: string
          empresa_id?: number | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "domain_rules_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          atualizado_em: string | null
          cnpj: string | null
          criado_em: string | null
          grafana_organization_id: number | null
          id: number
          nome_fantasia: string
          observacoes: string | null
          razao_social: string | null
        }
        Insert: {
          atualizado_em?: string | null
          cnpj?: string | null
          criado_em?: string | null
          grafana_organization_id?: number | null
          id?: number
          nome_fantasia: string
          observacoes?: string | null
          razao_social?: string | null
        }
        Update: {
          atualizado_em?: string | null
          cnpj?: string | null
          criado_em?: string | null
          grafana_organization_id?: number | null
          id?: number
          nome_fantasia?: string
          observacoes?: string | null
          razao_social?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresas_grafana_organization_id_fkey"
            columns: ["grafana_organization_id"]
            isOneToOne: false
            referencedRelation: "grafana_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      grafana_access_group_members: {
        Row: {
          criado_em: string
          group_id: number
          id: number
          usuario_id: number
        }
        Insert: {
          criado_em?: string
          group_id: number
          id?: number
          usuario_id: number
        }
        Update: {
          criado_em?: string
          group_id?: number
          id?: number
          usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "grafana_access_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "grafana_access_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grafana_access_group_members_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      grafana_access_groups: {
        Row: {
          active: boolean
          atualizado_em: string
          criado_em: string
          description: string | null
          id: number
          name: string
        }
        Insert: {
          active?: boolean
          atualizado_em?: string
          criado_em?: string
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          active?: boolean
          atualizado_em?: string
          criado_em?: string
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      grafana_automation_rules: {
        Row: {
          active: boolean
          atualizado_em: string
          criado_em: string
          criado_por: number | null
          description: string | null
          graph: Json
          id: number
          name: string
          priority: number
        }
        Insert: {
          active?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: number | null
          description?: string | null
          graph?: Json
          id?: number
          name: string
          priority?: number
        }
        Update: {
          active?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: number | null
          description?: string | null
          graph?: Json
          id?: number
          name?: string
          priority?: number
        }
        Relationships: []
      }
      grafana_group_org_permissions: {
        Row: {
          atualizado_em: string
          criado_em: string
          grafana_organization_id: number
          group_id: number
          id: number
          role: Database["public"]["Enums"]["grafana_role"]
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          grafana_organization_id: number
          group_id: number
          id?: number
          role?: Database["public"]["Enums"]["grafana_role"]
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          grafana_organization_id?: number
          group_id?: number
          id?: number
          role?: Database["public"]["Enums"]["grafana_role"]
        }
        Relationships: [
          {
            foreignKeyName: "grafana_group_org_permissions_grafana_organization_id_fkey"
            columns: ["grafana_organization_id"]
            isOneToOne: false
            referencedRelation: "grafana_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grafana_group_org_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "grafana_access_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      grafana_organizations: {
        Row: {
          active: boolean
          atualizado_em: string
          criado_em: string
          grafana_org_id: number
          id: number
          name: string
          slug: string | null
          synced_at: string | null
        }
        Insert: {
          active?: boolean
          atualizado_em?: string
          criado_em?: string
          grafana_org_id: number
          id?: number
          name: string
          slug?: string | null
          synced_at?: string | null
        }
        Update: {
          active?: boolean
          atualizado_em?: string
          criado_em?: string
          grafana_org_id?: number
          id?: number
          name?: string
          slug?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      grafana_sync_logs: {
        Row: {
          action: string
          actor_usuario_id: number | null
          criado_em: string
          error_message: string | null
          id: number
          request_payload: Json | null
          response_payload: Json | null
          status: string
          usuario_id: number | null
        }
        Insert: {
          action: string
          actor_usuario_id?: number | null
          criado_em?: string
          error_message?: string | null
          id?: number
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
          usuario_id?: number | null
        }
        Update: {
          action?: string
          actor_usuario_id?: number | null
          criado_em?: string
          error_message?: string | null
          id?: number
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          usuario_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grafana_sync_logs_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grafana_sync_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      grafana_user_links: {
        Row: {
          atualizado_em: string
          criado_em: string
          grafana_email: string | null
          grafana_login: string | null
          grafana_user_id: number | null
          id: number
          last_synced_at: string | null
          usuario_id: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          grafana_email?: string | null
          grafana_login?: string | null
          grafana_user_id?: number | null
          id?: number
          last_synced_at?: string | null
          usuario_id: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          grafana_email?: string | null
          grafana_login?: string | null
          grafana_user_id?: number | null
          id?: number
          last_synced_at?: string | null
          usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "grafana_user_links_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      grafana_user_org_permissions: {
        Row: {
          atualizado_em: string
          criado_em: string
          enabled: boolean
          grafana_organization_id: number
          id: number
          role: Database["public"]["Enums"]["grafana_role"]
          usuario_id: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          enabled?: boolean
          grafana_organization_id: number
          id?: number
          role?: Database["public"]["Enums"]["grafana_role"]
          usuario_id: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          enabled?: boolean
          grafana_organization_id?: number
          id?: number
          role?: Database["public"]["Enums"]["grafana_role"]
          usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "grafana_user_org_permissions_grafana_organization_id_fkey"
            columns: ["grafana_organization_id"]
            isOneToOne: false
            referencedRelation: "grafana_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grafana_user_org_permissions_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      links_internet: {
        Row: {
          atualizado_em: string | null
          bridge: boolean | null
          canal_atendimento: string | null
          criado_em: string | null
          finalidade: Database["public"]["Enums"]["finalidade_link"] | null
          gateway: string | null
          id: number
          ip_estatico: string | null
          ip_tipo: Database["public"]["Enums"]["ip_tipo"] | null
          ip_visibilidade: Database["public"]["Enums"]["ip_visibilidade"] | null
          mascara: string | null
          nome_link: string | null
          observacoes: string | null
          operadora_id: number
          pppoe_senha: string | null
          pppoe_usuario: string | null
          smart_sigma: boolean | null
          telefone_operadora: string | null
          tipo_autenticacao: string | null
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
          finalidade?: Database["public"]["Enums"]["finalidade_link"] | null
          gateway?: string | null
          id?: number
          ip_estatico?: string | null
          ip_tipo?: Database["public"]["Enums"]["ip_tipo"] | null
          ip_visibilidade?:
            | Database["public"]["Enums"]["ip_visibilidade"]
            | null
          mascara?: string | null
          nome_link?: string | null
          observacoes?: string | null
          operadora_id: number
          pppoe_senha?: string | null
          pppoe_usuario?: string | null
          smart_sigma?: boolean | null
          telefone_operadora?: string | null
          tipo_autenticacao?: string | null
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
          finalidade?: Database["public"]["Enums"]["finalidade_link"] | null
          gateway?: string | null
          id?: number
          ip_estatico?: string | null
          ip_tipo?: Database["public"]["Enums"]["ip_tipo"] | null
          ip_visibilidade?:
            | Database["public"]["Enums"]["ip_visibilidade"]
            | null
          mascara?: string | null
          nome_link?: string | null
          observacoes?: string | null
          operadora_id?: number
          pppoe_senha?: string | null
          pppoe_usuario?: string | null
          smart_sigma?: boolean | null
          telefone_operadora?: string | null
          tipo_autenticacao?: string | null
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
      module_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_manage: boolean
          can_update: boolean
          can_view: boolean
          created_at: string
          id: number
          module_key: string
          target_key: string
          target_type: string
          updated_at: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_manage?: boolean
          can_update?: boolean
          can_view?: boolean
          created_at?: string
          id?: number
          module_key: string
          target_key: string
          target_type: string
          updated_at?: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_manage?: boolean
          can_update?: boolean
          can_view?: boolean
          created_at?: string
          id?: number
          module_key?: string
          target_key?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      nfse_app_logs: {
        Row: {
          acao: string
          arquivo_fonte: string | null
          criado_em: string | null
          detalhes: string | null
          id: number
          ip_local: string | null
          maquina_os: string | null
          status: string
          usuario_id: number | null
        }
        Insert: {
          acao: string
          arquivo_fonte?: string | null
          criado_em?: string | null
          detalhes?: string | null
          id?: number
          ip_local?: string | null
          maquina_os?: string | null
          status: string
          usuario_id?: number | null
        }
        Update: {
          acao?: string
          arquivo_fonte?: string | null
          criado_em?: string | null
          detalhes?: string | null
          id?: number
          ip_local?: string | null
          maquina_os?: string | null
          status?: string
          usuario_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_app_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_app_origem: {
        Row: {
          criado_em: string | null
          origem: string
          usuario_id: number
        }
        Insert: {
          criado_em?: string | null
          origem?: string
          usuario_id: number
        }
        Update: {
          criado_em?: string | null
          origem?: string
          usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "nfse_app_origem_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
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
      password_reset_tokens: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          request_ip: string | null
          token_hash: string
          used_at: string | null
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          request_ip?: string | null
          token_hash: string
          used_at?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          request_ip?: string | null
          token_hash?: string
          used_at?: string | null
          user_agent?: string | null
          usuario_id?: string | null
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
      support_group_members: {
        Row: {
          ativo: boolean
          criado_em: string
          group_id: number
          id: number
          role_in_group: Database["public"]["Enums"]["support_group_role"]
          usuario_id: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          group_id: number
          id?: number
          role_in_group?: Database["public"]["Enums"]["support_group_role"]
          usuario_id: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          group_id?: number
          id?: number
          role_in_group?: Database["public"]["Enums"]["support_group_role"]
          usuario_id?: number
        }
        Relationships: []
      }
      support_groups: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          id: number
          nivel: Database["public"]["Enums"]["ticket_nivel"] | null
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: number
          nivel?: Database["public"]["Enums"]["ticket_nivel"] | null
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: number
          nivel?: Database["public"]["Enums"]["ticket_nivel"] | null
          nome?: string
        }
        Relationships: []
      }
      ticket_attachments: {
        Row: {
          autor_id: number | null
          autor_nome: string | null
          criado_em: string
          file_name: string
          id: number
          mime_type: string | null
          storage_path: string
          tamanho_bytes: number | null
          ticket_id: number
        }
        Insert: {
          autor_id?: number | null
          autor_nome?: string | null
          criado_em?: string
          file_name: string
          id?: number
          mime_type?: string | null
          storage_path: string
          tamanho_bytes?: number | null
          ticket_id: number
        }
        Update: {
          autor_id?: number | null
          autor_nome?: string | null
          criado_em?: string
          file_name?: string
          id?: number
          mime_type?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
          ticket_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_categorias: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: number
          nome: string
          parent_id: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: number
          nome: string
          parent_id?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: number
          nome?: string
          parent_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_categorias_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ticket_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          autor_id: number | null
          autor_nome: string | null
          conteudo: string
          criado_em: string
          id: number
          interno: boolean
          ticket_id: number
          tipo: Database["public"]["Enums"]["ticket_comment_type"]
        }
        Insert: {
          autor_id?: number | null
          autor_nome?: string | null
          conteudo: string
          criado_em?: string
          id?: number
          interno?: boolean
          ticket_id: number
          tipo?: Database["public"]["Enums"]["ticket_comment_type"]
        }
        Update: {
          autor_id?: number | null
          autor_nome?: string | null
          conteudo?: string
          criado_em?: string
          id?: number
          interno?: boolean
          ticket_id?: number
          tipo?: Database["public"]["Enums"]["ticket_comment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_filas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          id: number
          nome: string
          pausa_sla: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: number
          nome: string
          pausa_sla?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: number
          nome?: string
          pausa_sla?: boolean
        }
        Relationships: []
      }
      ticket_history: {
        Row: {
          autor_id: number | null
          autor_nome: string | null
          campo: string
          criado_em: string
          id: number
          observacao: string | null
          ticket_id: number
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          autor_id?: number | null
          autor_nome?: string | null
          campo: string
          criado_em?: string
          id?: number
          observacao?: string | null
          ticket_id: number
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          autor_id?: number | null
          autor_nome?: string | null
          campo?: string
          criado_em?: string
          id?: number
          observacao?: string | null
          ticket_id?: number
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_history_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_notifications: {
        Row: {
          criado_em: string
          id: number
          lida: boolean
          mensagem: string
          ticket_id: number
          tipo: string
          usuario_id: number
        }
        Insert: {
          criado_em?: string
          id?: number
          lida?: boolean
          mensagem: string
          ticket_id: number
          tipo: string
          usuario_id: number
        }
        Update: {
          criado_em?: string
          id?: number
          lida?: boolean
          mensagem?: string
          ticket_id?: number
          tipo?: string
          usuario_id?: number
        }
        Relationships: []
      }
      ticket_sla_alerts: {
        Row: {
          criado_em: string
          id: number
          notification_id: number | null
          sent_at: string
          sent_to_group_id: number | null
          sent_to_user_id: number | null
          sla_type: string
          threshold: string
          ticket_id: number
        }
        Insert: {
          criado_em?: string
          id?: number
          notification_id?: number | null
          sent_at?: string
          sent_to_group_id?: number | null
          sent_to_user_id?: number | null
          sla_type: string
          threshold: string
          ticket_id: number
        }
        Update: {
          criado_em?: string
          id?: number
          notification_id?: number | null
          sent_at?: string
          sent_to_group_id?: number | null
          sent_to_user_id?: number | null
          sla_type?: string
          threshold?: string
          ticket_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sla_alerts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sla_business_hours: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          dias_uteis: number[]
          feriados: Json
          hora_fim: string
          hora_inicio: string
          id: number
          nome: string
          padrao: boolean
          timezone: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          dias_uteis?: number[]
          feriados?: Json
          hora_fim?: string
          hora_inicio?: string
          id?: number
          nome?: string
          padrao?: boolean
          timezone?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          dias_uteis?: number[]
          feriados?: Json
          hora_fim?: string
          hora_inicio?: string
          id?: number
          nome?: string
          padrao?: boolean
          timezone?: string
        }
        Relationships: []
      }
      ticket_sla_pauses: {
        Row: {
          criado_em: string
          duration_minutes: number | null
          fila_id: number | null
          id: number
          motivo: string | null
          observacao: string | null
          paused_at: string
          paused_by: number | null
          resumed_at: string | null
          resumed_by: number | null
          sla_type: string
          status_pausa: string | null
          ticket_id: number
        }
        Insert: {
          criado_em?: string
          duration_minutes?: number | null
          fila_id?: number | null
          id?: number
          motivo?: string | null
          observacao?: string | null
          paused_at?: string
          paused_by?: number | null
          resumed_at?: string | null
          resumed_by?: number | null
          sla_type: string
          status_pausa?: string | null
          ticket_id: number
        }
        Update: {
          criado_em?: string
          duration_minutes?: number | null
          fila_id?: number | null
          id?: number
          motivo?: string | null
          observacao?: string | null
          paused_at?: string
          paused_by?: number | null
          resumed_at?: string | null
          resumed_by?: number | null
          sla_type?: string
          status_pausa?: string | null
          ticket_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sla_pauses_fila_id_fkey"
            columns: ["fila_id"]
            isOneToOne: false
            referencedRelation: "ticket_filas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sla_pauses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sla_policies: {
        Row: {
          ativo: boolean
          atualizado_em: string
          business_hours_only: boolean
          categoria_id: number | null
          criado_em: string
          descricao: string | null
          empresa_id: number | null
          first_response_minutes: number
          id: number
          nome: string
          prioridade: string | null
          prioridade_ordem: number
          resolution_minutes: number
          support_group_id: number | null
          tipo_chamado: string | null
          unidade_id: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          business_hours_only?: boolean
          categoria_id?: number | null
          criado_em?: string
          descricao?: string | null
          empresa_id?: number | null
          first_response_minutes: number
          id?: number
          nome: string
          prioridade?: string | null
          prioridade_ordem?: number
          resolution_minutes: number
          support_group_id?: number | null
          tipo_chamado?: string | null
          unidade_id?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          business_hours_only?: boolean
          categoria_id?: number | null
          criado_em?: string
          descricao?: string | null
          empresa_id?: number | null
          first_response_minutes?: number
          id?: number
          nome?: string
          prioridade?: string | null
          prioridade_ordem?: number
          resolution_minutes?: number
          support_group_id?: number | null
          tipo_chamado?: string | null
          unidade_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sla_policies_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "ticket_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sla_policies_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sla_policies_support_group_id_fkey"
            columns: ["support_group_id"]
            isOneToOne: false
            referencedRelation: "support_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sla_policies_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          aguardando_cliente_desde: string | null
          aguardando_cliente_motivo: string | null
          assigned_at: string | null
          assigned_by: number | null
          assigned_group_id: number | null
          ativo: string | null
          atualizado_em: string
          categoria_id: number | null
          codigo: string
          criado_em: string
          criado_por: number | null
          data_abertura: string
          data_fechamento: string | null
          data_primeiro_atendimento: string | null
          data_solucao: string | null
          descricao: string | null
          empresa_id: number | null
          fila_id: number | null
          first_response_alert_50_sent: boolean | null
          first_response_alert_75_sent: boolean | null
          first_response_alert_90_sent: boolean | null
          first_response_breach_alert_sent: boolean | null
          first_response_by: number | null
          first_response_due_at: string | null
          first_response_sla_status: string | null
          id: number
          link_id: number | null
          motivo_encerramento: string | null
          motivo_encerramento_outro: string | null
          nivel_escalonamento: Database["public"]["Enums"]["ticket_nivel"]
          operadora_id: number | null
          origem: Database["public"]["Enums"]["ticket_origem"]
          prioridade: Database["public"]["Enums"]["ticket_priority"]
          resolution_alert_50_sent: boolean | null
          resolution_alert_75_sent: boolean | null
          resolution_alert_90_sent: boolean | null
          resolution_breach_alert_sent: boolean | null
          resolution_due_at: string | null
          resolution_sla_status: string | null
          resolved_by: number | null
          sla_atendimento_minutos: number
          sla_pausa_inicio: string | null
          sla_pausa_total_segundos: number
          sla_pause_reason: string | null
          sla_policy_id: number | null
          sla_solucao_minutos: number
          solicitante_email: string | null
          solicitante_nome: string | null
          solicitante_telefone: string | null
          solucao_aplicada: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subcategoria_id: number | null
          tecnico_id: number | null
          tipo_chamado: string
          titulo: string
          unidade_id: number | null
        }
        Insert: {
          aguardando_cliente_desde?: string | null
          aguardando_cliente_motivo?: string | null
          assigned_at?: string | null
          assigned_by?: number | null
          assigned_group_id?: number | null
          ativo?: string | null
          atualizado_em?: string
          categoria_id?: number | null
          codigo: string
          criado_em?: string
          criado_por?: number | null
          data_abertura?: string
          data_fechamento?: string | null
          data_primeiro_atendimento?: string | null
          data_solucao?: string | null
          descricao?: string | null
          empresa_id?: number | null
          fila_id?: number | null
          first_response_alert_50_sent?: boolean | null
          first_response_alert_75_sent?: boolean | null
          first_response_alert_90_sent?: boolean | null
          first_response_breach_alert_sent?: boolean | null
          first_response_by?: number | null
          first_response_due_at?: string | null
          first_response_sla_status?: string | null
          id?: number
          link_id?: number | null
          motivo_encerramento?: string | null
          motivo_encerramento_outro?: string | null
          nivel_escalonamento?: Database["public"]["Enums"]["ticket_nivel"]
          operadora_id?: number | null
          origem?: Database["public"]["Enums"]["ticket_origem"]
          prioridade?: Database["public"]["Enums"]["ticket_priority"]
          resolution_alert_50_sent?: boolean | null
          resolution_alert_75_sent?: boolean | null
          resolution_alert_90_sent?: boolean | null
          resolution_breach_alert_sent?: boolean | null
          resolution_due_at?: string | null
          resolution_sla_status?: string | null
          resolved_by?: number | null
          sla_atendimento_minutos: number
          sla_pausa_inicio?: string | null
          sla_pausa_total_segundos?: number
          sla_pause_reason?: string | null
          sla_policy_id?: number | null
          sla_solucao_minutos: number
          solicitante_email?: string | null
          solicitante_nome?: string | null
          solicitante_telefone?: string | null
          solucao_aplicada?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategoria_id?: number | null
          tecnico_id?: number | null
          tipo_chamado?: string
          titulo: string
          unidade_id?: number | null
        }
        Update: {
          aguardando_cliente_desde?: string | null
          aguardando_cliente_motivo?: string | null
          assigned_at?: string | null
          assigned_by?: number | null
          assigned_group_id?: number | null
          ativo?: string | null
          atualizado_em?: string
          categoria_id?: number | null
          codigo?: string
          criado_em?: string
          criado_por?: number | null
          data_abertura?: string
          data_fechamento?: string | null
          data_primeiro_atendimento?: string | null
          data_solucao?: string | null
          descricao?: string | null
          empresa_id?: number | null
          fila_id?: number | null
          first_response_alert_50_sent?: boolean | null
          first_response_alert_75_sent?: boolean | null
          first_response_alert_90_sent?: boolean | null
          first_response_breach_alert_sent?: boolean | null
          first_response_by?: number | null
          first_response_due_at?: string | null
          first_response_sla_status?: string | null
          id?: number
          link_id?: number | null
          motivo_encerramento?: string | null
          motivo_encerramento_outro?: string | null
          nivel_escalonamento?: Database["public"]["Enums"]["ticket_nivel"]
          operadora_id?: number | null
          origem?: Database["public"]["Enums"]["ticket_origem"]
          prioridade?: Database["public"]["Enums"]["ticket_priority"]
          resolution_alert_50_sent?: boolean | null
          resolution_alert_75_sent?: boolean | null
          resolution_alert_90_sent?: boolean | null
          resolution_breach_alert_sent?: boolean | null
          resolution_due_at?: string | null
          resolution_sla_status?: string | null
          resolved_by?: number | null
          sla_atendimento_minutos?: number
          sla_pausa_inicio?: string | null
          sla_pausa_total_segundos?: number
          sla_pause_reason?: string | null
          sla_policy_id?: number | null
          sla_solucao_minutos?: number
          solicitante_email?: string | null
          solicitante_nome?: string | null
          solicitante_telefone?: string | null
          solucao_aplicada?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategoria_id?: number | null
          tecnico_id?: number | null
          tipo_chamado?: string
          titulo?: string
          unidade_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "ticket_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_fila_id_fkey"
            columns: ["fila_id"]
            isOneToOne: false
            referencedRelation: "ticket_filas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links_internet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_operadora_id_fkey"
            columns: ["operadora_id"]
            isOneToOne: false
            referencedRelation: "operadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sla_policy_fk"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "ticket_sla_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "ticket_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
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
          cnpj: string | null
          codigo_unidade: string | null
          complemento: string | null
          contato_nome: string | null
          criado_em: string | null
          ddns: string | null
          ddns_senha: string | null
          ddns_usuario: string | null
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
          cnpj?: string | null
          codigo_unidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          criado_em?: string | null
          ddns?: string | null
          ddns_senha?: string | null
          ddns_usuario?: string | null
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
          cnpj?: string | null
          codigo_unidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          criado_em?: string | null
          ddns?: string | null
          ddns_senha?: string | null
          ddns_usuario?: string | null
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
      user_audit_log: {
        Row: {
          acao: string
          actor_usuario_id: number | null
          created_at: string
          detalhe: Json | null
          id: number
          usuario_id: number
        }
        Insert: {
          acao: string
          actor_usuario_id?: number | null
          created_at?: string
          detalhe?: Json | null
          id?: number
          usuario_id: number
        }
        Update: {
          acao?: string
          actor_usuario_id?: number | null
          created_at?: string
          detalhe?: Json | null
          id?: number
          usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_audit_log_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_audit_log_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sync_status: {
        Row: {
          last_grafana_sync_at: string | null
          last_grafana_sync_error: string | null
          last_grafana_sync_payload: Json | null
          last_grafana_sync_status: string | null
          updated_at: string
          usuario_id: number
        }
        Insert: {
          last_grafana_sync_at?: string | null
          last_grafana_sync_error?: string | null
          last_grafana_sync_payload?: Json | null
          last_grafana_sync_status?: string | null
          updated_at?: string
          usuario_id: number
        }
        Update: {
          last_grafana_sync_at?: string | null
          last_grafana_sync_error?: string | null
          last_grafana_sync_payload?: Json | null
          last_grafana_sync_status?: string | null
          updated_at?: string
          usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_sync_status_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tab_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          tab_key: string
          updated_at: string
          usuario_id: number
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          tab_key: string
          updated_at?: string
          usuario_id: number
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          tab_key?: string
          updated_at?: string
          usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_tab_permissions_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          access_scope: Database["public"]["Enums"]["access_scope"]
          assinatura_email: string | null
          assinatura_email_url: string | null
          ativo: boolean | null
          atualizado_em: string | null
          auth_user_id: string | null
          avatar_url: string | null
          criado_em: string | null
          email: string
          empresa_id: number | null
          id: number
          nome: string
          permissao: string
          permissao_manual: boolean
          senha_hash: string | null
          telefone: string | null
          totp_enabled: boolean | null
          totp_secret: string | null
          zabbix_token_z1: string | null
          zabbix_token_z2: string | null
        }
        Insert: {
          access_scope?: Database["public"]["Enums"]["access_scope"]
          assinatura_email?: string | null
          assinatura_email_url?: string | null
          ativo?: boolean | null
          atualizado_em?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          criado_em?: string | null
          email: string
          empresa_id?: number | null
          id?: number
          nome: string
          permissao?: string
          permissao_manual?: boolean
          senha_hash?: string | null
          telefone?: string | null
          totp_enabled?: boolean | null
          totp_secret?: string | null
          zabbix_token_z1?: string | null
          zabbix_token_z2?: string | null
        }
        Update: {
          access_scope?: Database["public"]["Enums"]["access_scope"]
          assinatura_email?: string | null
          assinatura_email_url?: string | null
          ativo?: boolean | null
          atualizado_em?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          criado_em?: string | null
          email?: string
          empresa_id?: number | null
          id?: number
          nome?: string
          permissao?: string
          permissao_manual?: boolean
          senha_hash?: string | null
          telefone?: string | null
          totp_enabled?: boolean | null
          totp_secret?: string | null
          zabbix_token_z1?: string | null
          zabbix_token_z2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      zabbix_contatos: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          id: number
          prefixo: string
          primeiro_contato_nome: string | null
          primeiro_contato_telefone: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          id?: number
          prefixo: string
          primeiro_contato_nome?: string | null
          primeiro_contato_telefone?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          id?: number
          prefixo?: string
          primeiro_contato_nome?: string | null
          primeiro_contato_telefone?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_domain_rule: { Args: { _usuario_id: number }; Returns: Json }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      fn_can_view_ticket: { Args: { _ticket_id: number }; Returns: boolean }
      fn_cliente_encerrar_ticket: {
        Args: { _ticket_id: number }
        Returns: Json
      }
      fn_current_usuario: {
        Args: never
        Returns: {
          empresa_id: number
          id: number
          permissao: string
        }[]
      }
      fn_dashboard_by_fila: {
        Args: never
        Returns: {
          fila_id: number
          fila_nome: string
          total: number
        }[]
      }
      fn_dashboard_by_status: {
        Args: never
        Returns: {
          status: string
          total: number
        }[]
      }
      fn_dashboard_current_usuario: {
        Args: never
        Returns: {
          id: number
          permissao: string
        }[]
      }
      fn_dashboard_kpis: { Args: { _from: string; _to: string }; Returns: Json }
      fn_dashboard_pontos_atencao: {
        Args: never
        Returns: {
          codigo: string
          data_abertura: string
          id: number
          motivo: string
          pct_sla: number
          prioridade: string
          resolution_due_at: string
          resolution_sla_status: string
          status: string
          tecnico_nome: string
          titulo: string
        }[]
      }
      fn_dashboard_serie_diaria: {
        Args: { _from: string; _to: string }
        Returns: {
          abertos: number
          dia: string
          fechados: number
        }[]
      }
      fn_dashboard_tecnicos: {
        Args: { _from: string; _to: string }
        Returns: {
          abertos: number
          aguardando_cliente: number
          avatar_url: string
          em_atendimento: number
          fechados_periodo: number
          sla_cumprido: number
          sla_violado: number
          tecnico_id: number
          tecnico_nome: string
          tma_minutos: number
          tms_minutos: number
        }[]
      }
      fn_dashboard_ticket_ids: {
        Args: never
        Returns: {
          ticket_id: number
        }[]
      }
      fn_delete_usuario_cascade: {
        Args: { _usuario_id: number }
        Returns: Json
      }
      fn_find_sla_policy: {
        Args: {
          _categoria_id: number
          _empresa_id: number
          _prioridade: string
          _support_group_id: number
          _tipo: string
          _unidade_id: number
        }
        Returns: {
          ativo: boolean
          atualizado_em: string
          business_hours_only: boolean
          categoria_id: number | null
          criado_em: string
          descricao: string | null
          empresa_id: number | null
          first_response_minutes: number
          id: number
          nome: string
          prioridade: string | null
          prioridade_ordem: number
          resolution_minutes: number
          support_group_id: number | null
          tipo_chamado: string | null
          unidade_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "ticket_sla_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_user_allowed_tabs: {
        Args: { _usuario_id?: number }
        Returns: string[]
      }
      fn_user_context: { Args: never; Returns: Json }
      fn_user_module_perms: {
        Args: { _usuario_id: number }
        Returns: {
          can_create: boolean
          can_delete: boolean
          can_manage: boolean
          can_update: boolean
          can_view: boolean
          module_key: string
        }[]
      }
      grafana_effective_permissions: {
        Args: { _usuario_id: number }
        Returns: Json
      }
      grafana_evaluate_automations: {
        Args: { _usuario_id: number }
        Returns: Json
      }
      grafana_set_user_org_role: {
        Args: {
          _grafana_organization_id: number
          _role: string
          _usuario_id: number
        }
        Returns: Json
      }
      is_ariia_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      access_scope:
        | "ARIIA_ONLY"
        | "GRAFANA_ONLY"
        | "ARIIA_AND_GRAFANA"
        | "BLOCKED"
      finalidade_link: "principal" | "backup"
      grafana_role: "None" | "Viewer" | "Editor" | "Admin"
      ip_tipo: "dinamico" | "fixo"
      ip_visibilidade: "publico" | "privado"
      support_group_role: "MEMBRO" | "COORDENADOR" | "GESTOR"
      ticket_comment_type: "INTERNO" | "CLIENTE" | "AUTOMATICO"
      ticket_nivel: "N1" | "N2" | "N3"
      ticket_origem:
        | "MANUAL"
        | "EMAIL"
        | "TELEFONE"
        | "CHAT"
        | "MONITORAMENTO"
        | "API"
        | "N8N"
      ticket_priority: "CRITICO" | "ALTO" | "MEDIO" | "BAIXO"
      ticket_status:
        | "NOVO"
        | "TRIAGEM"
        | "EM_ATENDIMENTO"
        | "AGUARDANDO_CLIENTE"
        | "AGUARDANDO_OPERADORA"
        | "AGUARDANDO_TERCEIRO"
        | "AGENDADO"
        | "RESOLVIDO"
        | "FECHADO"
        | "CANCELADO"
      tipo_contato: "pessoa" | "responsavel"
      tipo_link:
        | "banda_larga"
        | "link_dedicado"
        | "4g"
        | "mpls"
        | "radio"
        | "satelite"
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
      access_scope: [
        "ARIIA_ONLY",
        "GRAFANA_ONLY",
        "ARIIA_AND_GRAFANA",
        "BLOCKED",
      ],
      finalidade_link: ["principal", "backup"],
      grafana_role: ["None", "Viewer", "Editor", "Admin"],
      ip_tipo: ["dinamico", "fixo"],
      ip_visibilidade: ["publico", "privado"],
      support_group_role: ["MEMBRO", "COORDENADOR", "GESTOR"],
      ticket_comment_type: ["INTERNO", "CLIENTE", "AUTOMATICO"],
      ticket_nivel: ["N1", "N2", "N3"],
      ticket_origem: [
        "MANUAL",
        "EMAIL",
        "TELEFONE",
        "CHAT",
        "MONITORAMENTO",
        "API",
        "N8N",
      ],
      ticket_priority: ["CRITICO", "ALTO", "MEDIO", "BAIXO"],
      ticket_status: [
        "NOVO",
        "TRIAGEM",
        "EM_ATENDIMENTO",
        "AGUARDANDO_CLIENTE",
        "AGUARDANDO_OPERADORA",
        "AGUARDANDO_TERCEIRO",
        "AGENDADO",
        "RESOLVIDO",
        "FECHADO",
        "CANCELADO",
      ],
      tipo_contato: ["pessoa", "responsavel"],
      tipo_link: [
        "banda_larga",
        "link_dedicado",
        "4g",
        "mpls",
        "radio",
        "satelite",
      ],
    },
  },
} as const
