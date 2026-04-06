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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agenda_tratamentos_assistido: {
        Row: {
          assistido_id: string
          assistido_tratamento_id: string
          created_at: string
          data_sessao: string
          horario: string | null
          id: string
          registrado_por: string | null
          status: string
          tratamento_id: string
          updated_at: string
        }
        Insert: {
          assistido_id: string
          assistido_tratamento_id: string
          created_at?: string
          data_sessao: string
          horario?: string | null
          id?: string
          registrado_por?: string | null
          status?: string
          tratamento_id: string
          updated_at?: string
        }
        Update: {
          assistido_id?: string
          assistido_tratamento_id?: string
          created_at?: string
          data_sessao?: string
          horario?: string | null
          id?: string
          registrado_por?: string | null
          status?: string
          tratamento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_tratamentos_assistido_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_tratamentos_assistido_assistido_tratamento_id_fkey"
            columns: ["assistido_tratamento_id"]
            isOneToOne: false
            referencedRelation: "assistido_tratamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_tratamentos_assistido_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
      }
      assistido_tratamentos: {
        Row: {
          agendado_por: string | null
          assistido_id: string
          created_at: string
          created_by: string
          data_inicio: string | null
          entrevista_id: string | null
          id: string
          observacoes: string | null
          prioridade: string
          quantidade_faltante: number | null
          quantidade_realizada: number
          quantidade_total: number
          status: string
          tratamento_id: string
          updated_at: string
          urgencia: string | null
        }
        Insert: {
          agendado_por?: string | null
          assistido_id: string
          created_at?: string
          created_by: string
          data_inicio?: string | null
          entrevista_id?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: string
          quantidade_faltante?: number | null
          quantidade_realizada?: number
          quantidade_total?: number
          status?: string
          tratamento_id: string
          updated_at?: string
          urgencia?: string | null
        }
        Update: {
          agendado_por?: string | null
          assistido_id?: string
          created_at?: string
          created_by?: string
          data_inicio?: string | null
          entrevista_id?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: string
          quantidade_faltante?: number | null
          quantidade_realizada?: number
          quantidade_total?: number
          status?: string
          tratamento_id?: string
          updated_at?: string
          urgencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistido_tratamentos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_tratamentos_entrevista_id_fkey"
            columns: ["entrevista_id"]
            isOneToOne: false
            referencedRelation: "entrevistas_fraternas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_tratamentos_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
      }
      assistidos: {
        Row: {
          bairro: string | null
          celular: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          created_by: string
          data_nascimento: string | null
          deleted_at: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          foto_url: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          quantidade_palestras: number
          status: string
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by: string
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          quantidade_palestras?: number
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          quantidade_palestras?: number
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          ip: string | null
          registro_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      avisos_internos: {
        Row: {
          created_at: string
          created_by: string | null
          destinatario_id: string
          id: string
          lido: boolean
          lido_em: string | null
          link: string | null
          mensagem: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destinatario_id: string
          id?: string
          lido?: boolean
          lido_em?: string | null
          link?: string | null
          mensagem: string
          tipo?: string
          titulo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destinatario_id?: string
          id?: string
          lido?: boolean
          lido_em?: string | null
          link?: string | null
          mensagem?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      configuracoes_gerais: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string
          updated_by: string | null
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: string
        }
        Relationships: []
      }
      entrevistas_fraternas: {
        Row: {
          assistido_id: string
          created_at: string
          data: string
          decisoes: string | null
          entrevistador_id: string
          id: string
          observacoes: string | null
          status: string
          tipo_entrevista: string
          updated_at: string
        }
        Insert: {
          assistido_id: string
          created_at?: string
          data: string
          decisoes?: string | null
          entrevistador_id: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo_entrevista?: string
          updated_at?: string
        }
        Update: {
          assistido_id?: string
          created_at?: string
          data?: string
          decisoes?: string | null
          entrevistador_id?: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo_entrevista?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrevistas_fraternas_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
        ]
      }
      instituicao_config: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string
          complemento: string | null
          created_at: string
          email_institucional: string | null
          estado: string | null
          id: string
          logo_url: string | null
          logradouro: string | null
          nome_fantasia: string
          numero: string | null
          observacoes: string | null
          razao_social: string
          telefone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj: string
          complemento?: string | null
          created_at?: string
          email_institucional?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          logradouro?: string | null
          nome_fantasia: string
          numero?: string | null
          observacoes?: string | null
          razao_social: string
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string
          complemento?: string | null
          created_at?: string
          email_institucional?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          logradouro?: string | null
          nome_fantasia?: string
          numero?: string | null
          observacoes?: string | null
          razao_social?: string
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      orientacoes_assistido: {
        Row: {
          assistido_id: string
          conteudo: string
          created_at: string
          created_by: string
          id: string
          titulo: string
          visivel_assistido: boolean
        }
        Insert: {
          assistido_id: string
          conteudo: string
          created_at?: string
          created_by: string
          id?: string
          titulo: string
          visivel_assistido?: boolean
        }
        Update: {
          assistido_id?: string
          conteudo?: string
          created_at?: string
          created_by?: string
          id?: string
          titulo?: string
          visivel_assistido?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orientacoes_assistido_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
        ]
      }
      palestras: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          id: string
          observacoes: string | null
          tema: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          observacoes?: string | null
          tema?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          tema?: string | null
        }
        Relationships: []
      }
      presencas_palestras: {
        Row: {
          assistido_id: string
          created_at: string
          id: string
          palestra_id: string
          presente: boolean
          registrado_por: string | null
        }
        Insert: {
          assistido_id: string
          created_at?: string
          id?: string
          palestra_id: string
          presente?: boolean
          registrado_por?: string | null
        }
        Update: {
          assistido_id?: string
          created_at?: string
          id?: string
          palestra_id?: string
          presente?: boolean
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presencas_palestras_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_palestras_palestra_id_fkey"
            columns: ["palestra_id"]
            isOneToOne: false
            referencedRelation: "palestras"
            referencedColumns: ["id"]
          },
        ]
      }
      presencas_tratamentos: {
        Row: {
          assistido_tratamento_id: string
          created_at: string
          data: string
          id: string
          observacao: string | null
          registrado_por: string
          status_presenca: string
        }
        Insert: {
          assistido_tratamento_id: string
          created_at?: string
          data: string
          id?: string
          observacao?: string | null
          registrado_por: string
          status_presenca?: string
        }
        Update: {
          assistido_tratamento_id?: string
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          registrado_por?: string
          status_presenca?: string
        }
        Relationships: [
          {
            foreignKeyName: "presencas_tratamentos_assistido_tratamento_id_fkey"
            columns: ["assistido_tratamento_id"]
            isOneToOne: false
            referencedRelation: "assistido_tratamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bairro: string | null
          celular: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          estado: string | null
          foto_url: string | null
          id: string
          logradouro: string | null
          nome_completo: string | null
          numero: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome_completo?: string | null
          numero?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome_completo?: string | null
          numero?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      regras_operacionais: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          descricao: string | null
          id: string
          updated_at: string
          updated_by: string | null
          valor: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: string
        }
        Relationships: []
      }
      tipos_tratamento: {
        Row: {
          bloqueia_proximo_tratamento: boolean
          coordenador_responsavel_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          dia_semana: number | null
          frequencia_unidade: string | null
          frequencia_valor: number | null
          horario: string | null
          id: string
          modo_agendamento: string
          nome: string
          observacoes: string | null
          ordem_tratamento: number | null
          quantidade_padrao_sessoes: number
          status: string
          tarefeiro_id: string | null
          tipo: string
          tratamento_livre: boolean
          updated_at: string
        }
        Insert: {
          bloqueia_proximo_tratamento?: boolean
          coordenador_responsavel_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dia_semana?: number | null
          frequencia_unidade?: string | null
          frequencia_valor?: number | null
          horario?: string | null
          id?: string
          modo_agendamento?: string
          nome: string
          observacoes?: string | null
          ordem_tratamento?: number | null
          quantidade_padrao_sessoes?: number
          status?: string
          tarefeiro_id?: string | null
          tipo: string
          tratamento_livre?: boolean
          updated_at?: string
        }
        Update: {
          bloqueia_proximo_tratamento?: boolean
          coordenador_responsavel_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dia_semana?: number | null
          frequencia_unidade?: string | null
          frequencia_valor?: number | null
          horario?: string | null
          id?: string
          modo_agendamento?: string
          nome?: string
          observacoes?: string | null
          ordem_tratamento?: number | null
          quantidade_padrao_sessoes?: number
          status?: string
          tarefeiro_id?: string | null
          tipo?: string
          tratamento_livre?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assistido_belongs_to_coordinator: {
        Args: { _assistido_id: string; _coordinator_id: string }
        Returns: boolean
      }
      entrevista_assistido_belongs_to_coordinator: {
        Args: { _assistido_id: string; _coordinator_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      registrar_presenca: {
        Args: {
          p_assistido_tratamento_id: string
          p_data: string
          p_observacao?: string
          p_registrado_por: string
          p_status_presenca: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "entrevistador"
        | "tarefeiro"
        | "assistido"
        | "coordenador_de_tratamento"
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
      app_role: [
        "admin",
        "entrevistador",
        "tarefeiro",
        "assistido",
        "coordenador_de_tratamento",
      ],
    },
  },
} as const
