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
      admin_promotion_approvals: {
        Row: {
          approver_id: string
          created_at: string
          decision: string
          id: string
          motivo: string | null
          request_id: string
        }
        Insert: {
          approver_id: string
          created_at?: string
          decision: string
          id?: string
          motivo?: string | null
          request_id: string
        }
        Update: {
          approver_id?: string
          created_at?: string
          decision?: string
          id?: string
          motivo?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_promotion_approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "admin_promotion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_promotion_requests: {
        Row: {
          concluido_em: string | null
          created_at: string
          excecao_master: boolean
          id: string
          justificativa: string
          requested_by: string
          required_approvals: number
          status: string
          target_role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          updated_at: string
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          excecao_master?: boolean
          id?: string
          justificativa: string
          requested_by: string
          required_approvals?: number
          status?: string
          target_role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          updated_at?: string
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          excecao_master?: boolean
          id?: string
          justificativa?: string
          requested_by?: string
          required_approvals?: number
          status?: string
          target_role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      app_cron_secrets: {
        Row: {
          created_at: string
          name: string
          secret: string
        }
        Insert: {
          created_at?: string
          name: string
          secret: string
        }
        Update: {
          created_at?: string
          name?: string
          secret?: string
        }
        Relationships: []
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
      cadastro_solicitacoes: {
        Row: {
          celular: string | null
          cpf: string | null
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          email: string
          id: string
          motivo_rejeicao: string | null
          nome_completo: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          celular?: string | null
          cpf?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          email: string
          id?: string
          motivo_rejeicao?: string | null
          nome_completo: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          celular?: string | null
          cpf?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          email?: string
          id?: string
          motivo_rejeicao?: string | null
          nome_completo?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      checkin_tentativas: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          motivo: string | null
          sucesso: boolean
          token: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          motivo?: string | null
          sucesso?: boolean
          token?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          motivo?: string | null
          sucesso?: boolean
          token?: string | null
        }
        Relationships: []
      }
      checkins_publicos: {
        Row: {
          assistido_id: string | null
          cadastro_rapido: boolean
          celular: string | null
          checkin_at: string
          created_at: string
          faixa_etaria: string | null
          id: string
          modo_checkin: string
          nome_participante: string | null
          registrado_por: string | null
          sessao_id: string
        }
        Insert: {
          assistido_id?: string | null
          cadastro_rapido?: boolean
          celular?: string | null
          checkin_at?: string
          created_at?: string
          faixa_etaria?: string | null
          id?: string
          modo_checkin?: string
          nome_participante?: string | null
          registrado_por?: string | null
          sessao_id: string
        }
        Update: {
          assistido_id?: string | null
          cadastro_rapido?: boolean
          celular?: string | null
          checkin_at?: string
          created_at?: string
          faixa_etaria?: string | null
          id?: string
          modo_checkin?: string
          nome_participante?: string | null
          registrado_por?: string | null
          sessao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_publicos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_publicos_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "sessoes_publicas"
            referencedColumns: ["id"]
          },
        ]
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
          created_by: string | null
          data: string
          decisoes: string | null
          entrevistador_id: string
          id: string
          observacoes: string | null
          status: string
          tipo_entrevista: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assistido_id: string
          created_at?: string
          created_by?: string | null
          data: string
          decisoes?: string | null
          entrevistador_id: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo_entrevista?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assistido_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          decisoes?: string | null
          entrevistador_id?: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo_entrevista?: string
          updated_at?: string
          updated_by?: string | null
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
      excecoes_operacionais: {
        Row: {
          atividade: string
          ativo: boolean
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          data_excecao: string
          horario_afetado: string | null
          id: string
          mensagem_ia: string | null
          motivo: string | null
          nova_data: string | null
          novo_horario: string | null
          observacao_interna: string | null
          prioridade: number
          status: string
          tipo: string
          tratamento_id: string | null
          updated_at: string
        }
        Insert: {
          atividade: string
          ativo?: boolean
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_excecao: string
          horario_afetado?: string | null
          id?: string
          mensagem_ia?: string | null
          motivo?: string | null
          nova_data?: string | null
          novo_horario?: string | null
          observacao_interna?: string | null
          prioridade?: number
          status?: string
          tipo?: string
          tratamento_id?: string | null
          updated_at?: string
        }
        Update: {
          atividade?: string
          ativo?: boolean
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_excecao?: string
          horario_afetado?: string | null
          id?: string
          mensagem_ia?: string | null
          motivo?: string | null
          nova_data?: string | null
          novo_horario?: string | null
          observacao_interna?: string | null
          prioridade?: number
          status?: string
          tipo?: string
          tratamento_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "excecoes_operacionais_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
      }
      funcoes_voluntariado: {
        Row: {
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          nome_funcao: string
          status: string
          tipo_voluntario: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          nome_funcao: string
          status?: string
          tipo_voluntario: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          nome_funcao?: string
          status?: string
          tipo_voluntario?: string
          updated_at?: string
        }
        Relationships: []
      }
      ia_biblioteca: {
        Row: {
          arquivo_url: string | null
          autor: string | null
          created_at: string
          created_by: string
          id: string
          resumo: string | null
          status: string
          subtitulos: string | null
          tema: string
          texto_indexavel: string | null
          tipo_material: string
          titulo: string
          updated_at: string
          usar_na_ia: boolean
        }
        Insert: {
          arquivo_url?: string | null
          autor?: string | null
          created_at?: string
          created_by: string
          id?: string
          resumo?: string | null
          status?: string
          subtitulos?: string | null
          tema?: string
          texto_indexavel?: string | null
          tipo_material?: string
          titulo: string
          updated_at?: string
          usar_na_ia?: boolean
        }
        Update: {
          arquivo_url?: string | null
          autor?: string | null
          created_at?: string
          created_by?: string
          id?: string
          resumo?: string | null
          status?: string
          subtitulos?: string | null
          tema?: string
          texto_indexavel?: string | null
          tipo_material?: string
          titulo?: string
          updated_at?: string
          usar_na_ia?: boolean
        }
        Relationships: []
      }
      ia_biblioteca_relacoes: {
        Row: {
          created_at: string
          id: string
          material_id: string
          observacao: string | null
          queixa_id: string | null
          tipo_relacao: string
          tratamento_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          observacao?: string | null
          queixa_id?: string | null
          tipo_relacao?: string
          tratamento_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          observacao?: string | null
          queixa_id?: string | null
          tipo_relacao?: string
          tratamento_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_biblioteca_relacoes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "ia_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_biblioteca_relacoes_queixa_id_fkey"
            columns: ["queixa_id"]
            isOneToOne: false
            referencedRelation: "ia_queixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_biblioteca_relacoes_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_configuracoes: {
        Row: {
          exibir_justificativa: boolean
          exigir_feedback: boolean
          id: string
          nivel_confianca_minimo: number
          peso_base_doutrinaria: number
          peso_base_operacional: number
          peso_historico: number
          updated_at: string
          updated_by: string | null
          usar_base_doutrinaria: boolean
          usar_base_operacional: boolean
          usar_historico_supervisionado: boolean
        }
        Insert: {
          exibir_justificativa?: boolean
          exigir_feedback?: boolean
          id?: string
          nivel_confianca_minimo?: number
          peso_base_doutrinaria?: number
          peso_base_operacional?: number
          peso_historico?: number
          updated_at?: string
          updated_by?: string | null
          usar_base_doutrinaria?: boolean
          usar_base_operacional?: boolean
          usar_historico_supervisionado?: boolean
        }
        Update: {
          exibir_justificativa?: boolean
          exigir_feedback?: boolean
          id?: string
          nivel_confianca_minimo?: number
          peso_base_doutrinaria?: number
          peso_base_operacional?: number
          peso_historico?: number
          updated_at?: string
          updated_by?: string | null
          usar_base_doutrinaria?: boolean
          usar_base_operacional?: boolean
          usar_historico_supervisionado?: boolean
        }
        Relationships: []
      }
      ia_feedback: {
        Row: {
          atribuicao_final_json: Json | null
          avaliador_id: string
          classificacao: string
          created_at: string
          diferencas_json: Json | null
          id: string
          motivo_ajuste: string | null
          observacao: string | null
          sugestao_ia_id: string
          sugestao_original_json: Json | null
          updated_at: string
        }
        Insert: {
          atribuicao_final_json?: Json | null
          avaliador_id: string
          classificacao?: string
          created_at?: string
          diferencas_json?: Json | null
          id?: string
          motivo_ajuste?: string | null
          observacao?: string | null
          sugestao_ia_id: string
          sugestao_original_json?: Json | null
          updated_at?: string
        }
        Update: {
          atribuicao_final_json?: Json | null
          avaliador_id?: string
          classificacao?: string
          created_at?: string
          diferencas_json?: Json | null
          id?: string
          motivo_ajuste?: string | null
          observacao?: string | null
          sugestao_ia_id?: string
          sugestao_original_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_feedback_sugestao_ia_id_fkey"
            columns: ["sugestao_ia_id"]
            isOneToOne: false
            referencedRelation: "ia_sugestoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_queixa_tratamento: {
        Row: {
          created_at: string
          created_by: string
          id: string
          observacao_doutrinaria: string | null
          observacao_operacional: string | null
          peso: number
          prioridade: string
          queixa_id: string
          status: string
          tipo_relacao: string
          tratamento_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          observacao_doutrinaria?: string | null
          observacao_operacional?: string | null
          peso?: number
          prioridade?: string
          queixa_id: string
          status?: string
          tipo_relacao?: string
          tratamento_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          observacao_doutrinaria?: string | null
          observacao_operacional?: string | null
          peso?: number
          prioridade?: string
          queixa_id?: string
          status?: string
          tipo_relacao?: string
          tratamento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_queixa_tratamento_queixa_id_fkey"
            columns: ["queixa_id"]
            isOneToOne: false
            referencedRelation: "ia_queixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_queixa_tratamento_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_queixas: {
        Row: {
          categoria: string
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          nivel_relevancia: string
          nome_queixa: string
          observacoes: string | null
          palavras_chave: string[] | null
          sinonimos: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          nivel_relevancia?: string
          nome_queixa: string
          observacoes?: string | null
          palavras_chave?: string[] | null
          sinonimos?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          nivel_relevancia?: string
          nome_queixa?: string
          observacoes?: string | null
          palavras_chave?: string[] | null
          sinonimos?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ia_sugestoes: {
        Row: {
          assistido_id: string
          created_at: string
          entrevista_id: string | null
          entrevistador_id: string
          id: string
          justificativa_ia: string | null
          materiais_consultados_json: Json | null
          quantidades_sugeridas_json: Json | null
          queixas_identificadas_json: Json | null
          resumo_ia: string | null
          status: string
          tratamentos_sugeridos_json: Json | null
          updated_at: string
        }
        Insert: {
          assistido_id: string
          created_at?: string
          entrevista_id?: string | null
          entrevistador_id: string
          id?: string
          justificativa_ia?: string | null
          materiais_consultados_json?: Json | null
          quantidades_sugeridas_json?: Json | null
          queixas_identificadas_json?: Json | null
          resumo_ia?: string | null
          status?: string
          tratamentos_sugeridos_json?: Json | null
          updated_at?: string
        }
        Update: {
          assistido_id?: string
          created_at?: string
          entrevista_id?: string | null
          entrevistador_id?: string
          id?: string
          justificativa_ia?: string | null
          materiais_consultados_json?: Json | null
          quantidades_sugeridas_json?: Json | null
          queixas_identificadas_json?: Json | null
          resumo_ia?: string | null
          status?: string
          tratamentos_sugeridos_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_sugestoes_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_sugestoes_entrevista_id_fkey"
            columns: ["entrevista_id"]
            isOneToOne: false
            referencedRelation: "entrevistas_fraternas"
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
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notificacoes_fila: {
        Row: {
          assistido_id: string | null
          canal: Database["public"]["Enums"]["notif_canal"]
          created_at: string
          dedupe_key: string
          erro: string | null
          evento_origem: Database["public"]["Enums"]["notif_evento"]
          external_message_id: string | null
          id: string
          payload_json: Json
          retry_count: number
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notif_status"]
          telefone_normalizado: string | null
          template_codigo: string | null
          updated_at: string
        }
        Insert: {
          assistido_id?: string | null
          canal?: Database["public"]["Enums"]["notif_canal"]
          created_at?: string
          dedupe_key: string
          erro?: string | null
          evento_origem: Database["public"]["Enums"]["notif_evento"]
          external_message_id?: string | null
          id?: string
          payload_json?: Json
          retry_count?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notif_status"]
          telefone_normalizado?: string | null
          template_codigo?: string | null
          updated_at?: string
        }
        Update: {
          assistido_id?: string | null
          canal?: Database["public"]["Enums"]["notif_canal"]
          created_at?: string
          dedupe_key?: string
          erro?: string | null
          evento_origem?: Database["public"]["Enums"]["notif_evento"]
          external_message_id?: string | null
          id?: string
          payload_json?: Json
          retry_count?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notif_status"]
          telefone_normalizado?: string | null
          template_codigo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_fila_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_log: {
        Row: {
          created_at: string
          direcao: string
          erro: string | null
          fila_id: string | null
          id: string
          payload_enviado: Json | null
          payload_recebido: Json | null
          status: string | null
        }
        Insert: {
          created_at?: string
          direcao: string
          erro?: string | null
          fila_id?: string | null
          id?: string
          payload_enviado?: Json | null
          payload_recebido?: Json | null
          status?: string | null
        }
        Update: {
          created_at?: string
          direcao?: string
          erro?: string | null
          fila_id?: string | null
          id?: string
          payload_enviado?: Json | null
          payload_recebido?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_log_fila_id_fkey"
            columns: ["fila_id"]
            isOneToOne: false
            referencedRelation: "notificacoes_fila"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_preferencias: {
        Row: {
          assistido_id: string
          created_at: string
          horario_fim_envio: string
          horario_inicio_envio: string
          id: string
          opt_out_at: string | null
          opt_out_motivo: string | null
          updated_at: string
          whatsapp_ativo: boolean
        }
        Insert: {
          assistido_id: string
          created_at?: string
          horario_fim_envio?: string
          horario_inicio_envio?: string
          id?: string
          opt_out_at?: string | null
          opt_out_motivo?: string | null
          updated_at?: string
          whatsapp_ativo?: boolean
        }
        Update: {
          assistido_id?: string
          created_at?: string
          horario_fim_envio?: string
          horario_inicio_envio?: string
          id?: string
          opt_out_at?: string | null
          opt_out_motivo?: string | null
          updated_at?: string
          whatsapp_ativo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_preferencias_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: true
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_templates: {
        Row: {
          ativo: boolean
          canal: Database["public"]["Enums"]["notif_canal"]
          codigo_template: string
          corpo_template: string
          created_at: string
          id: string
          tipo_evento: Database["public"]["Enums"]["notif_evento"]
          titulo_interno: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          canal?: Database["public"]["Enums"]["notif_canal"]
          codigo_template: string
          corpo_template: string
          created_at?: string
          id?: string
          tipo_evento: Database["public"]["Enums"]["notif_evento"]
          titulo_interno: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          canal?: Database["public"]["Enums"]["notif_canal"]
          codigo_template?: string
          corpo_template?: string
          created_at?: string
          id?: string
          tipo_evento?: Database["public"]["Enums"]["notif_evento"]
          titulo_interno?: string
          updated_at?: string
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
          senha_temporaria: boolean
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
          senha_temporaria?: boolean
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
          senha_temporaria?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      programacao_padrao: {
        Row: {
          atividade: string
          ativo: boolean
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          dia_semana: number
          frequencia: string | null
          horario: string | null
          id: string
          observacao: string | null
          tipo: string
          tratamento_id: string | null
          updated_at: string
        }
        Insert: {
          atividade: string
          ativo?: boolean
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          dia_semana: number
          frequencia?: string | null
          horario?: string | null
          id?: string
          observacao?: string | null
          tipo?: string
          tratamento_id?: string | null
          updated_at?: string
        }
        Update: {
          atividade?: string
          ativo?: boolean
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          dia_semana?: number
          frequencia?: string | null
          horario?: string | null
          id?: string
          observacao?: string | null
          tipo?: string
          tratamento_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_padrao_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
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
      sessoes_publicas: {
        Row: {
          created_at: string
          criado_por: string | null
          data_sessao: string
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          status: string
          token: string
          total_presentes: number
          tratamento_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data_sessao: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          status?: string
          token?: string
          total_presentes?: number
          tratamento_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data_sessao?: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          status?: string
          token?: string
          total_presentes?: number
          tratamento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_publicas_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_tratamento: {
        Row: {
          bloqueia_proximo_tratamento: boolean
          coordenador_responsavel_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          dia_semana: number | null
          exige_controle_presenca: boolean
          frequencia_unidade: string | null
          frequencia_valor: number | null
          horario: string | null
          id: string
          modo_agendamento: string
          modo_checkin: string
          nome: string
          observacoes: string | null
          ordem_tratamento: number | null
          permite_cadastro_rapido: boolean
          permite_entrada_sem_agendamento: boolean
          permite_registro_manual: boolean
          quantidade_padrao_sessoes: number
          status: string
          tarefeiro_id: string | null
          tipo: string
          trabalho_publico: boolean
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
          exige_controle_presenca?: boolean
          frequencia_unidade?: string | null
          frequencia_valor?: number | null
          horario?: string | null
          id?: string
          modo_agendamento?: string
          modo_checkin?: string
          nome: string
          observacoes?: string | null
          ordem_tratamento?: number | null
          permite_cadastro_rapido?: boolean
          permite_entrada_sem_agendamento?: boolean
          permite_registro_manual?: boolean
          quantidade_padrao_sessoes?: number
          status?: string
          tarefeiro_id?: string | null
          tipo: string
          trabalho_publico?: boolean
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
          exige_controle_presenca?: boolean
          frequencia_unidade?: string | null
          frequencia_valor?: number | null
          horario?: string | null
          id?: string
          modo_agendamento?: string
          modo_checkin?: string
          nome?: string
          observacoes?: string | null
          ordem_tratamento?: number | null
          permite_cadastro_rapido?: boolean
          permite_entrada_sem_agendamento?: boolean
          permite_registro_manual?: boolean
          quantidade_padrao_sessoes?: number
          status?: string
          tarefeiro_id?: string | null
          tipo?: string
          trabalho_publico?: boolean
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
      voluntario_funcoes: {
        Row: {
          created_at: string
          funcao_id: string
          id: string
          voluntario_id: string
        }
        Insert: {
          created_at?: string
          funcao_id: string
          id?: string
          voluntario_id: string
        }
        Update: {
          created_at?: string
          funcao_id?: string
          id?: string
          voluntario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voluntario_funcoes_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes_voluntariado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voluntario_funcoes_voluntario_id_fkey"
            columns: ["voluntario_id"]
            isOneToOne: false
            referencedRelation: "voluntarios"
            referencedColumns: ["id"]
          },
        ]
      }
      voluntarios: {
        Row: {
          atuacao_detalhada: string | null
          bairro: string
          celular: string
          cep: string
          cidade: string
          complemento: string | null
          cpf: string
          created_at: string
          created_by: string
          data_adesao_voluntariado: string | null
          data_desligamento: string | null
          data_ingresso_sistema: string
          data_nascimento: string
          email: string
          estado: string
          foto_url: string | null
          id: string
          logradouro: string
          nome_completo: string
          numero: string
          observacoes: string | null
          rg: string | null
          status: string
          termo_assinado_em: string | null
          termo_assinado_nome: string | null
          termo_assinado_path: string | null
          termo_gerado_em: string | null
          termo_gerado_por: string | null
          termo_rejeitado_motivo: string | null
          termo_status: string
          termo_validado_em: string | null
          termo_validado_por: string | null
          tipos_voluntario: string[]
          updated_at: string
        }
        Insert: {
          atuacao_detalhada?: string | null
          bairro: string
          celular: string
          cep: string
          cidade: string
          complemento?: string | null
          cpf: string
          created_at?: string
          created_by: string
          data_adesao_voluntariado?: string | null
          data_desligamento?: string | null
          data_ingresso_sistema?: string
          data_nascimento: string
          email: string
          estado: string
          foto_url?: string | null
          id?: string
          logradouro: string
          nome_completo: string
          numero: string
          observacoes?: string | null
          rg?: string | null
          status?: string
          termo_assinado_em?: string | null
          termo_assinado_nome?: string | null
          termo_assinado_path?: string | null
          termo_gerado_em?: string | null
          termo_gerado_por?: string | null
          termo_rejeitado_motivo?: string | null
          termo_status?: string
          termo_validado_em?: string | null
          termo_validado_por?: string | null
          tipos_voluntario?: string[]
          updated_at?: string
        }
        Update: {
          atuacao_detalhada?: string | null
          bairro?: string
          celular?: string
          cep?: string
          cidade?: string
          complemento?: string | null
          cpf?: string
          created_at?: string
          created_by?: string
          data_adesao_voluntariado?: string | null
          data_desligamento?: string | null
          data_ingresso_sistema?: string
          data_nascimento?: string
          email?: string
          estado?: string
          foto_url?: string | null
          id?: string
          logradouro?: string
          nome_completo?: string
          numero?: string
          observacoes?: string | null
          rg?: string | null
          status?: string
          termo_assinado_em?: string | null
          termo_assinado_nome?: string | null
          termo_assinado_path?: string | null
          termo_gerado_em?: string | null
          termo_gerado_por?: string | null
          termo_rejeitado_motivo?: string | null
          termo_status?: string
          termo_validado_em?: string | null
          termo_validado_por?: string | null
          tipos_voluntario?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_conversas: {
        Row: {
          assistido_id: string | null
          atendente_responsavel: string | null
          contexto_atividade: string | null
          contexto_data: string | null
          created_at: string
          em_handoff: boolean
          id: string
          revisada_em: string | null
          revisada_por: string | null
          status_conversa: Database["public"]["Enums"]["conversa_status"]
          telefone: string
          ultima_mensagem: string | null
          ultima_resposta_ia: string | null
          ultimo_contato_em: string
          updated_at: string
        }
        Insert: {
          assistido_id?: string | null
          atendente_responsavel?: string | null
          contexto_atividade?: string | null
          contexto_data?: string | null
          created_at?: string
          em_handoff?: boolean
          id?: string
          revisada_em?: string | null
          revisada_por?: string | null
          status_conversa?: Database["public"]["Enums"]["conversa_status"]
          telefone: string
          ultima_mensagem?: string | null
          ultima_resposta_ia?: string | null
          ultimo_contato_em?: string
          updated_at?: string
        }
        Update: {
          assistido_id?: string | null
          atendente_responsavel?: string | null
          contexto_atividade?: string | null
          contexto_data?: string | null
          created_at?: string
          em_handoff?: boolean
          id?: string
          revisada_em?: string | null
          revisada_por?: string | null
          status_conversa?: Database["public"]["Enums"]["conversa_status"]
          telefone?: string
          ultima_mensagem?: string | null
          ultima_resposta_ia?: string | null
          ultimo_contato_em?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_handoffs: {
        Row: {
          atendente_id: string | null
          classificado_por_ia: boolean
          closed_at: string | null
          conversa_id: string
          created_at: string
          id: string
          motivo: string | null
          opened_at: string
          origem: string
          status: Database["public"]["Enums"]["handoff_status"]
          updated_at: string
        }
        Insert: {
          atendente_id?: string | null
          classificado_por_ia?: boolean
          closed_at?: string | null
          conversa_id: string
          created_at?: string
          id?: string
          motivo?: string | null
          opened_at?: string
          origem?: string
          status?: Database["public"]["Enums"]["handoff_status"]
          updated_at?: string
        }
        Update: {
          atendente_id?: string | null
          classificado_por_ia?: boolean
          closed_at?: string | null
          conversa_id?: string
          created_at?: string
          id?: string
          motivo?: string | null
          opened_at?: string
          origem?: string
          status?: Database["public"]["Enums"]["handoff_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_handoffs_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agendar_entrevista_fraterna: {
        Args: {
          _assistido_id: string
          _data: string
          _observacoes: string
          _tipo: string
        }
        Returns: string
      }
      assistido_belongs_to_coordinator: {
        Args: { _assistido_id: string; _coordinator_id: string }
        Returns: boolean
      }
      count_active_masters: { Args: never; Returns: number }
      count_apt_admins: { Args: never; Returns: number }
      dashboard_admin: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      decidir_promocao_admin: {
        Args: { p_decision: string; p_motivo?: string; p_request_id: string }
        Returns: Json
      }
      entrevista_assistido_belongs_to_coordinator: {
        Args: { _assistido_id: string; _coordinator_id: string }
        Returns: boolean
      }
      fn_enqueue_notificacao: {
        Args: {
          p_assistido_id: string
          p_dedupe_key: string
          p_evento: Database["public"]["Enums"]["notif_evento"]
          p_payload: Json
          p_scheduled_at: string
          p_template: string
        }
        Returns: undefined
      }
      fn_normalize_phone: { Args: { p: string }; Returns: string }
      gerenciar_termo_voluntario: {
        Args: {
          p_action: string
          p_motivo?: string
          p_nome?: string
          p_path?: string
          p_voluntario_id: string
        }
        Returns: Json
      }
      gerenciar_voluntario: {
        Args: { p_action: string; p_motivo?: string; p_voluntario_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_admin: { Args: { _uid: string }; Returns: boolean }
      is_active_master: { Args: { _uid: string }; Returns: boolean }
      painel_conversas: {
        Args: {
          p_atendente?: string
          p_busca?: string
          p_fim?: string
          p_handoff?: boolean
          p_identificado?: boolean
          p_inicio?: string
          p_limit?: number
          p_pendente?: boolean
          p_resolucao_ia?: boolean
          p_status?: string
        }
        Returns: Json
      }
      painel_whatsapp: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      painel_whatsapp_v2: {
        Args: {
          p_assistido?: string
          p_fim: string
          p_inicio: string
          p_optout?: boolean
          p_resolucao?: string
          p_status?: string
          p_template?: string
        }
        Returns: Json
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
      relatorio_carga_tarefeiro: {
        Args: {
          p_data_fim: string
          p_data_inicio: string
          p_page?: number
          p_page_size?: number
          p_tarefeiro_id?: string
          p_tratamento_id?: string
        }
        Returns: Json
      }
      relatorio_faltas_periodo: {
        Args: {
          p_assistido_id?: string
          p_coordenador_id?: string
          p_data_fim: string
          p_data_inicio: string
          p_page?: number
          p_page_size?: number
          p_tarefeiro_id?: string
          p_tratamento_id?: string
        }
        Returns: Json
      }
      relatorio_frequencia_presenca: {
        Args: {
          p_assistido_id?: string
          p_coordenador_id?: string
          p_data_fim: string
          p_data_inicio: string
          p_page?: number
          p_page_size?: number
          p_tarefeiro_id?: string
          p_tratamento_id?: string
        }
        Returns: Json
      }
      relatorio_tratamentos_concluidos: {
        Args: {
          p_coordenador_id?: string
          p_data_fim: string
          p_data_inicio: string
          p_page?: number
          p_page_size?: number
          p_tarefeiro_id?: string
          p_tipo?: string
          p_tratamento_id?: string
        }
        Returns: Json
      }
      solicitar_promocao_admin: {
        Args: {
          p_justificativa: string
          p_target_role: string
          p_target_user_id: string
        }
        Returns: Json
      }
      staff_names: {
        Args: { _ids?: string[] }
        Returns: {
          nome_completo: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "entrevistador"
        | "tarefeiro"
        | "assistido"
        | "coordenador_de_tratamento"
        | "administrador_master"
      conversa_status: "ativa" | "encerrada"
      handoff_status: "aberto" | "em_atendimento" | "fechado"
      notif_canal: "whatsapp"
      notif_evento:
        | "entrevista_criada"
        | "entrevista_lembrete"
        | "sessao_criada"
        | "sessao_lembrete"
        | "remarcacao"
        | "cancelamento"
      notif_status: "pendente" | "agendado" | "enviado" | "falha" | "cancelado"
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
        "administrador_master",
      ],
      conversa_status: ["ativa", "encerrada"],
      handoff_status: ["aberto", "em_atendimento", "fechado"],
      notif_canal: ["whatsapp"],
      notif_evento: [
        "entrevista_criada",
        "entrevista_lembrete",
        "sessao_criada",
        "sessao_lembrete",
        "remarcacao",
        "cancelamento",
      ],
      notif_status: ["pendente", "agendado", "enviado", "falha", "cancelado"],
    },
  },
} as const
