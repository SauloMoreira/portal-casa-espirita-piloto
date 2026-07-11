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
      acao_social_alimentos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          instituicao_id: string
          nome: string
          observacao: string | null
          ordem: number
          quantidade_faltante: number | null
          quantidade_necessaria: number | null
          unidade: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          instituicao_id: string
          nome: string
          observacao?: string | null
          ordem?: number
          quantidade_faltante?: number | null
          quantidade_necessaria?: number | null
          unidade?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          instituicao_id?: string
          nome?: string
          observacao?: string | null
          ordem?: number
          quantidade_faltante?: number | null
          quantidade_necessaria?: number | null
          unidade?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acao_social_alimentos_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      acao_social_config: {
        Row: {
          created_at: string
          exibir_prazo: boolean
          id: string
          mensagem_institucional: string | null
          observacao_prazo: string | null
          prazo_final_entrega: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          exibir_prazo?: boolean
          id?: string
          mensagem_institucional?: string | null
          observacao_prazo?: string | null
          prazo_final_entrega?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          exibir_prazo?: boolean
          id?: string
          mensagem_institucional?: string | null
          observacao_prazo?: string | null
          prazo_final_entrega?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
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
      assinatura_modulos: {
        Row: {
          assinatura_id: string
          ativo: boolean
          created_at: string
          id: string
          modulo_id: string
          observacao: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assinatura_id: string
          ativo?: boolean
          created_at?: string
          id?: string
          modulo_id: string
          observacao?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assinatura_id?: string
          ativo?: boolean
          created_at?: string
          id?: string
          modulo_id?: string
          observacao?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_modulos_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinatura_modulos_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          classificacao: string | null
          condicao_especial: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          forma_pagamento: string | null
          id: string
          instituicao_id: string
          observacoes_cliente: string | null
          observacoes_comerciais: string | null
          plano_id: string
          proximo_vencimento: string | null
          status: Database["public"]["Enums"]["saas_assinatura_status"]
          trial_ate: string | null
          ultimo_pagamento_em: string | null
          updated_at: string
          valor_mensal_cents: number | null
        }
        Insert: {
          classificacao?: string | null
          condicao_especial?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          forma_pagamento?: string | null
          id?: string
          instituicao_id: string
          observacoes_cliente?: string | null
          observacoes_comerciais?: string | null
          plano_id: string
          proximo_vencimento?: string | null
          status?: Database["public"]["Enums"]["saas_assinatura_status"]
          trial_ate?: string | null
          ultimo_pagamento_em?: string | null
          updated_at?: string
          valor_mensal_cents?: number | null
        }
        Update: {
          classificacao?: string | null
          condicao_especial?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          forma_pagamento?: string | null
          id?: string
          instituicao_id?: string
          observacoes_cliente?: string | null
          observacoes_comerciais?: string | null
          plano_id?: string
          proximo_vencimento?: string | null
          status?: Database["public"]["Enums"]["saas_assinatura_status"]
          trial_ate?: string | null
          ultimo_pagamento_em?: string | null
          updated_at?: string
          valor_mensal_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
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
          faltas_consecutivas: number
          id: string
          observacao_migracao: string | null
          observacoes: string | null
          origem: string
          prioridade: string
          quantidade_faltante: number | null
          quantidade_realizada: number
          quantidade_total: number
          remarcacoes_automaticas: number
          status: string
          tratamento_id: string
          ultima_presenca_em: string | null
          ultimo_status_operacional: string | null
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
          faltas_consecutivas?: number
          id?: string
          observacao_migracao?: string | null
          observacoes?: string | null
          origem?: string
          prioridade?: string
          quantidade_faltante?: number | null
          quantidade_realizada?: number
          quantidade_total?: number
          remarcacoes_automaticas?: number
          status?: string
          tratamento_id: string
          ultima_presenca_em?: string | null
          ultimo_status_operacional?: string | null
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
          faltas_consecutivas?: number
          id?: string
          observacao_migracao?: string | null
          observacoes?: string | null
          origem?: string
          prioridade?: string
          quantidade_faltante?: number | null
          quantidade_realizada?: number
          quantidade_total?: number
          remarcacoes_automaticas?: number
          status?: string
          tratamento_id?: string
          ultima_presenca_em?: string | null
          ultimo_status_operacional?: string | null
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
          cadastro_completo: boolean
          celular: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          created_by: string
          data_migracao: string | null
          data_nascimento: string | null
          deleted_at: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          foto_url: string | null
          id: string
          instituicao_id: string
          logradouro: string | null
          migrado_legado: boolean
          nome: string
          numero: string | null
          observacao_migracao: string | null
          observacoes: string | null
          origem_cadastro: string
          quantidade_palestras: number
          status: string
          telefone: string | null
          updated_at: string
          usa_agenda_plano: boolean
          user_id: string | null
        }
        Insert: {
          bairro?: string | null
          cadastro_completo?: boolean
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by: string
          data_migracao?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          instituicao_id: string
          logradouro?: string | null
          migrado_legado?: boolean
          nome: string
          numero?: string | null
          observacao_migracao?: string | null
          observacoes?: string | null
          origem_cadastro?: string
          quantidade_palestras?: number
          status?: string
          telefone?: string | null
          updated_at?: string
          usa_agenda_plano?: boolean
          user_id?: string | null
        }
        Update: {
          bairro?: string | null
          cadastro_completo?: boolean
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string
          data_migracao?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          instituicao_id?: string
          logradouro?: string | null
          migrado_legado?: boolean
          nome?: string
          numero?: string | null
          observacao_migracao?: string | null
          observacoes?: string | null
          origem_cadastro?: string
          quantidade_palestras?: number
          status?: string
          telefone?: string | null
          updated_at?: string
          usa_agenda_plano?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistidos_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
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
      avisos_ausencia: {
        Row: {
          agenda_id: string | null
          assistido_id: string
          created_at: string
          data_compromisso: string
          entrevista_id: string | null
          id: string
          motivo: string | null
          resolucao: string | null
          status: string
          tipo_compromisso: string
          tratado_em: string | null
          tratado_por: string | null
          updated_at: string
        }
        Insert: {
          agenda_id?: string | null
          assistido_id: string
          created_at?: string
          data_compromisso: string
          entrevista_id?: string | null
          id?: string
          motivo?: string | null
          resolucao?: string | null
          status?: string
          tipo_compromisso: string
          tratado_em?: string | null
          tratado_por?: string | null
          updated_at?: string
        }
        Update: {
          agenda_id?: string | null
          assistido_id?: string
          created_at?: string
          data_compromisso?: string
          entrevista_id?: string | null
          id?: string
          motivo?: string | null
          resolucao?: string | null
          status?: string
          tipo_compromisso?: string
          tratado_em?: string | null
          tratado_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_ausencia_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "agenda_tratamentos_assistido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_ausencia_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_ausencia_entrevista_id_fkey"
            columns: ["entrevista_id"]
            isOneToOne: false
            referencedRelation: "entrevistas_fraternas"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_internos: {
        Row: {
          created_at: string
          created_by: string | null
          destinatario_id: string
          id: string
          instituicao_id: string
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
          instituicao_id: string
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
          instituicao_id?: string
          lido?: boolean
          lido_em?: string | null
          link?: string | null
          mensagem?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_internos_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
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
      campanhas: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao_completa: string | null
          descricao_curta: string | null
          destaque: boolean
          id: string
          imagem_atualizada_em: string | null
          imagem_atualizada_por: string | null
          imagem_formato: string
          imagem_origem: string
          imagem_otimizada: boolean
          imagem_url: string | null
          instituicao_id: string
          ordem: number
          subtitulo: string | null
          titulo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao_completa?: string | null
          descricao_curta?: string | null
          destaque?: boolean
          id?: string
          imagem_atualizada_em?: string | null
          imagem_atualizada_por?: string | null
          imagem_formato?: string
          imagem_origem?: string
          imagem_otimizada?: boolean
          imagem_url?: string | null
          instituicao_id: string
          ordem?: number
          subtitulo?: string | null
          titulo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao_completa?: string | null
          descricao_curta?: string | null
          destaque?: boolean
          id?: string
          imagem_atualizada_em?: string | null
          imagem_atualizada_por?: string | null
          imagem_formato?: string
          imagem_origem?: string
          imagem_otimizada?: boolean
          imagem_url?: string | null
          instituicao_id?: string
          ordem?: number
          subtitulo?: string | null
          titulo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      chamado_anexos: {
        Row: {
          chamado_id: string
          created_at: string
          enviado_por_user_id: string
          id: string
          instituicao_id: string
          mensagem_id: string | null
          mime_type: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
        }
        Insert: {
          chamado_id: string
          created_at?: string
          enviado_por_user_id: string
          id?: string
          instituicao_id: string
          mensagem_id?: string | null
          mime_type: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
        }
        Update: {
          chamado_id?: string
          created_at?: string
          enviado_por_user_id?: string
          id?: string
          instituicao_id?: string
          mensagem_id?: string | null
          mime_type?: string
          nome_arquivo?: string
          storage_path?: string
          tamanho_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "chamado_anexos_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados_suporte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamado_anexos_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamado_anexos_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "chamado_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      chamado_mensagens: {
        Row: {
          autor_user_id: string
          chamado_id: string
          created_at: string
          id: string
          instituicao_id: string
          interno: boolean
          mensagem: string
        }
        Insert: {
          autor_user_id: string
          chamado_id: string
          created_at?: string
          id?: string
          instituicao_id: string
          interno?: boolean
          mensagem: string
        }
        Update: {
          autor_user_id?: string
          chamado_id?: string
          created_at?: string
          id?: string
          instituicao_id?: string
          interno?: boolean
          mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamado_mensagens_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados_suporte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamado_mensagens_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      chamados_suporte: {
        Row: {
          assunto: string
          codigo_tecnico: string | null
          concluido_em: string | null
          created_at: string
          criado_por_user_id: string
          descricao: string
          fechado_em: string | null
          fechado_por_user_id: string | null
          fechamento_categoria:
            | Database["public"]["Enums"]["chamado_fechamento_categoria"]
            | null
          fechamento_texto: string | null
          id: string
          instituicao_id: string
          metadata: Json
          origem: string | null
          prioridade: Database["public"]["Enums"]["chamado_prioridade"]
          resolucao_em: string | null
          resolucao_por_user_id: string | null
          resolucao_texto: string | null
          resolucao_tipo:
            | Database["public"]["Enums"]["chamado_resolucao_tipo"]
            | null
          responsavel_user_id: string | null
          status: Database["public"]["Enums"]["chamado_status"]
          tipo: Database["public"]["Enums"]["chamado_tipo"]
          updated_at: string
          visibilidade: Database["public"]["Enums"]["chamado_visibilidade"]
        }
        Insert: {
          assunto: string
          codigo_tecnico?: string | null
          concluido_em?: string | null
          created_at?: string
          criado_por_user_id: string
          descricao: string
          fechado_em?: string | null
          fechado_por_user_id?: string | null
          fechamento_categoria?:
            | Database["public"]["Enums"]["chamado_fechamento_categoria"]
            | null
          fechamento_texto?: string | null
          id?: string
          instituicao_id: string
          metadata?: Json
          origem?: string | null
          prioridade?: Database["public"]["Enums"]["chamado_prioridade"]
          resolucao_em?: string | null
          resolucao_por_user_id?: string | null
          resolucao_texto?: string | null
          resolucao_tipo?:
            | Database["public"]["Enums"]["chamado_resolucao_tipo"]
            | null
          responsavel_user_id?: string | null
          status?: Database["public"]["Enums"]["chamado_status"]
          tipo?: Database["public"]["Enums"]["chamado_tipo"]
          updated_at?: string
          visibilidade?: Database["public"]["Enums"]["chamado_visibilidade"]
        }
        Update: {
          assunto?: string
          codigo_tecnico?: string | null
          concluido_em?: string | null
          created_at?: string
          criado_por_user_id?: string
          descricao?: string
          fechado_em?: string | null
          fechado_por_user_id?: string | null
          fechamento_categoria?:
            | Database["public"]["Enums"]["chamado_fechamento_categoria"]
            | null
          fechamento_texto?: string | null
          id?: string
          instituicao_id?: string
          metadata?: Json
          origem?: string | null
          prioridade?: Database["public"]["Enums"]["chamado_prioridade"]
          resolucao_em?: string | null
          resolucao_por_user_id?: string | null
          resolucao_texto?: string | null
          resolucao_tipo?:
            | Database["public"]["Enums"]["chamado_resolucao_tipo"]
            | null
          responsavel_user_id?: string | null
          status?: Database["public"]["Enums"]["chamado_status"]
          tipo?: Database["public"]["Enums"]["chamado_tipo"]
          updated_at?: string
          visibilidade?: Database["public"]["Enums"]["chamado_visibilidade"]
        }
        Relationships: [
          {
            foreignKeyName: "chamados_suporte_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
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
      comunicacoes_institucionais: {
        Row: {
          campanha_id: string | null
          created_at: string
          created_by: string | null
          envio_concluido_at: string | null
          envio_iniciado_at: string | null
          envio_status: string
          evento_id: string | null
          id: string
          instituicao_id: string
          mensagem: string
          publico_criterio: string
          publico_estimado: number
          revisado_at: string | null
          revisado_por: string | null
          status: string
          tipo: string
          titulo: string
          total_bloqueados: number
          total_destinatarios: number
          total_enviados: number
          total_falhas: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campanha_id?: string | null
          created_at?: string
          created_by?: string | null
          envio_concluido_at?: string | null
          envio_iniciado_at?: string | null
          envio_status?: string
          evento_id?: string | null
          id?: string
          instituicao_id: string
          mensagem: string
          publico_criterio?: string
          publico_estimado?: number
          revisado_at?: string | null
          revisado_por?: string | null
          status?: string
          tipo?: string
          titulo: string
          total_bloqueados?: number
          total_destinatarios?: number
          total_enviados?: number
          total_falhas?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campanha_id?: string | null
          created_at?: string
          created_by?: string | null
          envio_concluido_at?: string | null
          envio_iniciado_at?: string | null
          envio_status?: string
          evento_id?: string | null
          id?: string
          instituicao_id?: string
          mensagem?: string
          publico_criterio?: string
          publico_estimado?: number
          revisado_at?: string | null
          revisado_por?: string | null
          status?: string
          tipo?: string
          titulo?: string
          total_bloqueados?: number
          total_destinatarios?: number
          total_enviados?: number
          total_falhas?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_institucionais_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_institucionais_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_institucionais_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacoes_institucionais_envios: {
        Row: {
          assistido_id: string
          comunicacao_id: string
          created_at: string
          erro: string | null
          external_message_id: string | null
          id: string
          motivo: string | null
          retry_count: number
          scheduled_at: string
          sent_at: string | null
          status: string
          telefone_normalizado: string | null
          updated_at: string
        }
        Insert: {
          assistido_id: string
          comunicacao_id: string
          created_at?: string
          erro?: string | null
          external_message_id?: string | null
          id?: string
          motivo?: string | null
          retry_count?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          telefone_normalizado?: string | null
          updated_at?: string
        }
        Update: {
          assistido_id?: string
          comunicacao_id?: string
          created_at?: string
          erro?: string | null
          external_message_id?: string | null
          id?: string
          motivo?: string | null
          retry_count?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          telefone_normalizado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_institucionais_envios_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_institucionais_envios_comunicacao_id_fkey"
            columns: ["comunicacao_id"]
            isOneToOne: false
            referencedRelation: "comunicacoes_institucionais"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicador_alerta_config: {
        Row: {
          ativo: boolean
          created_at: string
          recebe_alertas_central: boolean
          ultimo_alerta_em: string | null
          ultimo_snapshot: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          recebe_alertas_central?: boolean
          ultimo_alerta_em?: string | null
          ultimo_snapshot?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          recebe_alertas_central?: boolean
          ultimo_alerta_em?: string | null
          ultimo_snapshot?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      configuracoes_gerais: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          instituicao_id: string
          updated_at: string
          updated_by: string | null
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          instituicao_id: string
          updated_at?: string
          updated_by?: string | null
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          instituicao_id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_gerais_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimentos_comunicacao: {
        Row: {
          acao: string
          assistido_id: string
          canal: string
          created_at: string
          created_by: string | null
          id: string
          observacao: string | null
          origem: string
          updated_at: string
          updated_by: string | null
          versao_termo: string | null
        }
        Insert: {
          acao: string
          assistido_id: string
          canal?: string
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          updated_at?: string
          updated_by?: string | null
          versao_termo?: string | null
        }
        Update: {
          acao?: string
          assistido_id?: string
          canal?: string
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          updated_at?: string
          updated_by?: string | null
          versao_termo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_comunicacao_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
        ]
      }
      coordenacao_tratamento: {
        Row: {
          coordenador_id: string
          created_at: string
          created_by: string | null
          id: string
          tratamento_id: string
        }
        Insert: {
          coordenador_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          tratamento_id: string
        }
        Update: {
          coordenador_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tratamento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordenacao_tratamento_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
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
      eventos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          data_evento: string | null
          data_evento_fim: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao_completa: string | null
          descricao_curta: string | null
          destaque: boolean
          id: string
          imagem_atualizada_em: string | null
          imagem_atualizada_por: string | null
          imagem_formato: string
          imagem_origem: string
          imagem_otimizada: boolean
          imagem_url: string | null
          instituicao_id: string
          local: string | null
          ordem: number
          subtitulo: string | null
          titulo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data_evento?: string | null
          data_evento_fim?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao_completa?: string | null
          descricao_curta?: string | null
          destaque?: boolean
          id?: string
          imagem_atualizada_em?: string | null
          imagem_atualizada_por?: string | null
          imagem_formato?: string
          imagem_origem?: string
          imagem_otimizada?: boolean
          imagem_url?: string | null
          instituicao_id: string
          local?: string | null
          ordem?: number
          subtitulo?: string | null
          titulo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data_evento?: string | null
          data_evento_fim?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao_completa?: string | null
          descricao_curta?: string | null
          destaque?: boolean
          id?: string
          imagem_atualizada_em?: string | null
          imagem_atualizada_por?: string | null
          imagem_formato?: string
          imagem_origem?: string
          imagem_otimizada?: boolean
          imagem_url?: string | null
          instituicao_id?: string
          local?: string | null
          ordem?: number
          subtitulo?: string | null
          titulo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
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
          instituicao_id: string
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
          instituicao_id: string
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
          instituicao_id?: string
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
            foreignKeyName: "excecoes_operacionais_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
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
      ia_site_documentos: {
        Row: {
          captured_at: string | null
          categoria: string
          corpo: string
          created_at: string
          created_by: string | null
          data_conteudo: string | null
          hash: string | null
          id: string
          prioridade: string
          resumo: string
          status: string
          temporal: boolean
          titulo: string
          updated_at: string
          updated_by: string | null
          url: string
          usar_na_ia: boolean
        }
        Insert: {
          captured_at?: string | null
          categoria?: string
          corpo?: string
          created_at?: string
          created_by?: string | null
          data_conteudo?: string | null
          hash?: string | null
          id?: string
          prioridade?: string
          resumo?: string
          status?: string
          temporal?: boolean
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          url: string
          usar_na_ia?: boolean
        }
        Update: {
          captured_at?: string | null
          categoria?: string
          corpo?: string
          created_at?: string
          created_by?: string | null
          data_conteudo?: string | null
          hash?: string | null
          id?: string
          prioridade?: string
          resumo?: string
          status?: string
          temporal?: boolean
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          url?: string
          usar_na_ia?: boolean
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
          assinatura_rodape: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string
          complemento: string | null
          cor_primaria: string | null
          cor_secundaria: string | null
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
          slogan: string | null
          telefone: string | null
          texto_institucional: string | null
          updated_at: string
          updated_by: string | null
          whatsapp: string | null
        }
        Insert: {
          assinatura_rodape?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj: string
          complemento?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
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
          slogan?: string | null
          telefone?: string | null
          texto_institucional?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Update: {
          assinatura_rodape?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string
          complemento?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
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
          slogan?: string | null
          telefone?: string | null
          texto_institucional?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      instituicao_usuarios: {
        Row: {
          created_at: string
          id: string
          instituicao_id: string
          papel_local: Database["public"]["Enums"]["saas_papel_local"]
          status: Database["public"]["Enums"]["saas_vinculo_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instituicao_id: string
          papel_local: Database["public"]["Enums"]["saas_papel_local"]
          status?: Database["public"]["Enums"]["saas_vinculo_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instituicao_id?: string
          papel_local?: Database["public"]["Enums"]["saas_papel_local"]
          status?: Database["public"]["Enums"]["saas_vinculo_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instituicao_usuarios_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      instituicoes: {
        Row: {
          cidade: string | null
          classificacao_comercial: Database["public"]["Enums"]["saas_classificacao_comercial"]
          cnpj: string | null
          created_at: string
          email_contato: string | null
          id: string
          nome: string
          nome_fantasia: string | null
          slug: string
          status: Database["public"]["Enums"]["saas_instituicao_status"]
          telefone_contato: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          classificacao_comercial?: Database["public"]["Enums"]["saas_classificacao_comercial"]
          cnpj?: string | null
          created_at?: string
          email_contato?: string | null
          id?: string
          nome: string
          nome_fantasia?: string | null
          slug: string
          status?: Database["public"]["Enums"]["saas_instituicao_status"]
          telefone_contato?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          classificacao_comercial?: Database["public"]["Enums"]["saas_classificacao_comercial"]
          cnpj?: string | null
          created_at?: string
          email_contato?: string | null
          id?: string
          nome?: string
          nome_fantasia?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["saas_instituicao_status"]
          telefone_contato?: string | null
          uf?: string | null
          updated_at?: string
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
      modulos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
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
          comunicacao_geral_ativa: boolean
          consentimento_at: string | null
          consentimento_origem: string | null
          consentimento_status: string
          consentimento_versao: string | null
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
          comunicacao_geral_ativa?: boolean
          consentimento_at?: string | null
          consentimento_origem?: string | null
          consentimento_status?: string
          consentimento_versao?: string | null
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
          comunicacao_geral_ativa?: boolean
          consentimento_at?: string | null
          consentimento_origem?: string | null
          consentimento_status?: string
          consentimento_versao?: string | null
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
          instituicao_id: string
          observacoes: string | null
          tema: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          instituicao_id: string
          observacoes?: string | null
          tema?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          instituicao_id?: string
          observacoes?: string | null
          tema?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "palestras_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_modulos: {
        Row: {
          ativo: boolean
          created_at: string
          modulo_id: string
          plano_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          modulo_id: string
          plano_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          modulo_id?: string
          plano_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_modulos_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_modulos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_tratamento_sessoes: {
        Row: {
          agenda_sessao_id: string | null
          assistido_id: string
          assistido_tratamento_id: string
          bloqueado_por_etapa_anterior: boolean
          created_at: string
          data_base_utilizada: string | null
          data_prevista: string | null
          eh_publico_livre: boolean
          horario_previsto: string | null
          id: string
          numero_etapa: number
          ordem_tratamento: number | null
          origem: string
          quantidade_total_do_tratamento: number
          status_etapa: Database["public"]["Enums"]["status_etapa_plano"]
          tipo_tratamento_id: string
          updated_at: string
        }
        Insert: {
          agenda_sessao_id?: string | null
          assistido_id: string
          assistido_tratamento_id: string
          bloqueado_por_etapa_anterior?: boolean
          created_at?: string
          data_base_utilizada?: string | null
          data_prevista?: string | null
          eh_publico_livre?: boolean
          horario_previsto?: string | null
          id?: string
          numero_etapa: number
          ordem_tratamento?: number | null
          origem?: string
          quantidade_total_do_tratamento: number
          status_etapa?: Database["public"]["Enums"]["status_etapa_plano"]
          tipo_tratamento_id: string
          updated_at?: string
        }
        Update: {
          agenda_sessao_id?: string | null
          assistido_id?: string
          assistido_tratamento_id?: string
          bloqueado_por_etapa_anterior?: boolean
          created_at?: string
          data_base_utilizada?: string | null
          data_prevista?: string | null
          eh_publico_livre?: boolean
          horario_previsto?: string | null
          id?: string
          numero_etapa?: number
          ordem_tratamento?: number | null
          origem?: string
          quantidade_total_do_tratamento?: number
          status_etapa?: Database["public"]["Enums"]["status_etapa_plano"]
          tipo_tratamento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_tratamento_sessoes_agenda_sessao_id_fkey"
            columns: ["agenda_sessao_id"]
            isOneToOne: false
            referencedRelation: "agenda_tratamentos_assistido"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          valor_implantacao: number
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          valor_implantacao?: number
          valor_mensal?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          valor_implantacao?: number
          valor_mensal?: number
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          papel: Database["public"]["Enums"]["saas_papel_global"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          papel: Database["public"]["Enums"]["saas_papel_global"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          papel?: Database["public"]["Enums"]["saas_papel_global"]
          user_id?: string
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
          comunicacao_geral_ativa: boolean
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
          comunicacao_geral_ativa?: boolean
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
          comunicacao_geral_ativa?: boolean
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
          instituicao_id: string
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
          instituicao_id: string
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
          instituicao_id?: string
          observacao?: string | null
          tipo?: string
          tratamento_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_padrao_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
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
          confirmacao_reforcada: boolean
          created_at: string
          descricao: string | null
          governavel: boolean
          id: string
          impacto: string | null
          instituicao_id: string
          nome_amigavel: string | null
          opcoes: Json | null
          sensivel: boolean
          tipo: string
          updated_at: string
          updated_by: string | null
          valor: string
          valor_max: number | null
          valor_min: number | null
          valor_padrao: string | null
        }
        Insert: {
          ativo?: boolean
          chave: string
          confirmacao_reforcada?: boolean
          created_at?: string
          descricao?: string | null
          governavel?: boolean
          id?: string
          impacto?: string | null
          instituicao_id: string
          nome_amigavel?: string | null
          opcoes?: Json | null
          sensivel?: boolean
          tipo?: string
          updated_at?: string
          updated_by?: string | null
          valor: string
          valor_max?: number | null
          valor_min?: number | null
          valor_padrao?: string | null
        }
        Update: {
          ativo?: boolean
          chave?: string
          confirmacao_reforcada?: boolean
          created_at?: string
          descricao?: string | null
          governavel?: boolean
          id?: string
          impacto?: string | null
          instituicao_id?: string
          nome_amigavel?: string | null
          opcoes?: Json | null
          sensivel?: boolean
          tipo?: string
          updated_at?: string
          updated_by?: string | null
          valor?: string
          valor_max?: number | null
          valor_min?: number | null
          valor_padrao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_operacionais_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      saas05_i_fallback_events: {
        Row: {
          contexto: Json
          created_at: string
          fail_closed: boolean
          fallback_nome: string
          id: string
          marcador: string
          motivo: string
          origem_tenant: string | null
          tenant_resolvido: string | null
        }
        Insert: {
          contexto?: Json
          created_at?: string
          fail_closed?: boolean
          fallback_nome: string
          id?: string
          marcador?: string
          motivo: string
          origem_tenant?: string | null
          tenant_resolvido?: string | null
        }
        Update: {
          contexto?: Json
          created_at?: string
          fail_closed?: boolean
          fallback_nome?: string
          id?: string
          marcador?: string
          motivo?: string
          origem_tenant?: string | null
          tenant_resolvido?: string | null
        }
        Relationships: []
      }
      saas05_i_legacy_rpc_events: {
        Row: {
          contexto: Json
          created_at: string
          id: string
          marcador: string
          origem: string | null
          overload_tenant_aware_existe: boolean
          rpc_nome: string
          tenant_recebido: string | null
        }
        Insert: {
          contexto?: Json
          created_at?: string
          id?: string
          marcador?: string
          origem?: string | null
          overload_tenant_aware_existe?: boolean
          rpc_nome: string
          tenant_recebido?: string | null
        }
        Update: {
          contexto?: Json
          created_at?: string
          id?: string
          marcador?: string
          origem?: string | null
          overload_tenant_aware_existe?: boolean
          rpc_nome?: string
          tenant_recebido?: string | null
        }
        Relationships: []
      }
      sessoes_publicas: {
        Row: {
          capacidade: number | null
          created_at: string
          criado_por: string | null
          data_sessao: string
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          instituicao_id: string
          local: string | null
          observacoes: string | null
          status: string
          token: string
          total_presentes: number
          tratamento_id: string
          updated_at: string
        }
        Insert: {
          capacidade?: number | null
          created_at?: string
          criado_por?: string | null
          data_sessao: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instituicao_id: string
          local?: string | null
          observacoes?: string | null
          status?: string
          token?: string
          total_presentes?: number
          tratamento_id: string
          updated_at?: string
        }
        Update: {
          capacidade?: number | null
          created_at?: string
          criado_por?: string | null
          data_sessao?: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instituicao_id?: string
          local?: string | null
          observacoes?: string | null
          status?: string
          token?: string
          total_presentes?: number
          tratamento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_publicas_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessoes_publicas_tratamento_id_fkey"
            columns: ["tratamento_id"]
            isOneToOne: false
            referencedRelation: "tipos_tratamento"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_comerciais: {
        Row: {
          atendimento_assumido_em: string | null
          concluida_em: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          instituicao_id: string
          mensagem: string
          modulo_codigo: string | null
          observacao_interna: string | null
          primeiro_alerta_em: string | null
          prioridade: string
          proximo_alerta_em: string | null
          quantidade_alertas: number
          responsavel_user_id: string | null
          solicitante_user_id: string
          status: string
          tipo: string
          ultimo_alerta_em: string | null
          updated_at: string
        }
        Insert: {
          atendimento_assumido_em?: string | null
          concluida_em?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          instituicao_id: string
          mensagem: string
          modulo_codigo?: string | null
          observacao_interna?: string | null
          primeiro_alerta_em?: string | null
          prioridade?: string
          proximo_alerta_em?: string | null
          quantidade_alertas?: number
          responsavel_user_id?: string | null
          solicitante_user_id: string
          status?: string
          tipo: string
          ultimo_alerta_em?: string | null
          updated_at?: string
        }
        Update: {
          atendimento_assumido_em?: string | null
          concluida_em?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          instituicao_id?: string
          mensagem?: string
          modulo_codigo?: string | null
          observacao_interna?: string | null
          primeiro_alerta_em?: string | null
          prioridade?: string
          proximo_alerta_em?: string | null
          quantidade_alertas?: number
          responsavel_user_id?: string | null
          solicitante_user_id?: string
          status?: string
          tipo?: string
          ultimo_alerta_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_comerciais_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_tratamento: {
        Row: {
          bloqueia_proximo_tratamento: boolean
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
          bairro: string | null
          cadastro_completo: boolean
          celular: string
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          created_by: string
          data_adesao_voluntariado: string | null
          data_desligamento: string | null
          data_ingresso_sistema: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          foto_url: string | null
          id: string
          instituicao_id: string
          logradouro: string | null
          nome_completo: string
          numero: string | null
          observacoes: string | null
          origem_assistido_id: string | null
          origem_cadastro: string | null
          origem_user_id: string | null
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
          bairro?: string | null
          cadastro_completo?: boolean
          celular: string
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by: string
          data_adesao_voluntariado?: string | null
          data_desligamento?: string | null
          data_ingresso_sistema?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          instituicao_id: string
          logradouro?: string | null
          nome_completo: string
          numero?: string | null
          observacoes?: string | null
          origem_assistido_id?: string | null
          origem_cadastro?: string | null
          origem_user_id?: string | null
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
          bairro?: string | null
          cadastro_completo?: boolean
          celular?: string
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string
          data_adesao_voluntariado?: string | null
          data_desligamento?: string | null
          data_ingresso_sistema?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          instituicao_id?: string
          logradouro?: string | null
          nome_completo?: string
          numero?: string | null
          observacoes?: string | null
          origem_assistido_id?: string | null
          origem_cadastro?: string | null
          origem_user_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "voluntarios_instituicao_id_fkey"
            columns: ["instituicao_id"]
            isOneToOne: false
            referencedRelation: "instituicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voluntarios_origem_assistido_id_fkey"
            columns: ["origem_assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversas: {
        Row: {
          assistido_id: string | null
          atendente_responsavel: string | null
          contexto_atividade: string | null
          contexto_conversa: Json | null
          contexto_data: string | null
          created_at: string
          em_handoff: boolean
          id: string
          nome_contato: string | null
          revisada_em: string | null
          revisada_por: string | null
          status_conversa: Database["public"]["Enums"]["conversa_status"]
          telefone: string
          tipo_contato: string | null
          ultima_mensagem: string | null
          ultima_resposta_ia: string | null
          ultimo_contato_em: string
          updated_at: string
        }
        Insert: {
          assistido_id?: string | null
          atendente_responsavel?: string | null
          contexto_atividade?: string | null
          contexto_conversa?: Json | null
          contexto_data?: string | null
          created_at?: string
          em_handoff?: boolean
          id?: string
          nome_contato?: string | null
          revisada_em?: string | null
          revisada_por?: string | null
          status_conversa?: Database["public"]["Enums"]["conversa_status"]
          telefone: string
          tipo_contato?: string | null
          ultima_mensagem?: string | null
          ultima_resposta_ia?: string | null
          ultimo_contato_em?: string
          updated_at?: string
        }
        Update: {
          assistido_id?: string | null
          atendente_responsavel?: string | null
          contexto_atividade?: string | null
          contexto_conversa?: Json | null
          contexto_data?: string | null
          created_at?: string
          em_handoff?: boolean
          id?: string
          nome_contato?: string | null
          revisada_em?: string | null
          revisada_por?: string | null
          status_conversa?: Database["public"]["Enums"]["conversa_status"]
          telefone?: string
          tipo_contato?: string | null
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
      _chamado_auditar: {
        Args: {
          p_actor: string
          p_chamado_id: string
          p_instituicao_id: string
          p_marcador: string
          p_payload: Json
        }
        Returns: undefined
      }
      _chamado_registrar_evento: {
        Args: {
          p_autor: string
          p_chamado_id: string
          p_instituicao_id: string
          p_interno?: boolean
          p_mensagem: string
        }
        Returns: string
      }
      agendar_entrevista_fraterna:
        | {
            Args: {
              _assistido_id: string
              _data: string
              _observacoes: string
              _tipo: string
            }
            Returns: string
          }
        | {
            Args: {
              _assistido_id: string
              _data: string
              _observacoes: string
              _tipo: string
              p_instituicao_id: string
            }
            Returns: string
          }
      assistido_belongs_to_coordinator: {
        Args: { _assistido_id: string; _coordinator_id: string }
        Returns: boolean
      }
      comunicadores_elegiveis:
        | {
            Args: never
            Returns: {
              celular: string
              user_id: string
            }[]
          }
        | {
            Args: { p_instituicao_id: string }
            Returns: {
              celular: string
              user_id: string
            }[]
          }
      contar_publico_elegivel: { Args: { p_versao: string }; Returns: number }
      count_active_masters: { Args: never; Returns: number }
      count_apt_admins: { Args: never; Returns: number }
      current_instituicao_id: { Args: never; Returns: string }
      dashboard_admin:
        | { Args: { p_fim: string; p_inicio: string }; Returns: Json }
        | {
            Args: { p_fim: string; p_inicio: string; p_instituicao_id: string }
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
      fila_humana_pendente:
        | {
            Args: never
            Returns: {
              idade_mais_antiga_min: number
              total_pendentes: number
            }[]
          }
        | {
            Args: { p_instituicao_id: string }
            Returns: {
              idade_mais_antiga_min: number
              total_pendentes: number
            }[]
          }
      fn_abrir_chamado_tecnico: {
        Args: {
          p_assunto: string
          p_codigo_tecnico: string
          p_descricao: string
          p_instituicao_id: string
          p_metadata?: Json
          p_origem: string
        }
        Returns: string
      }
      fn_add_business_hours: {
        Args: { _base: string; _hours: number }
        Returns: string
      }
      fn_assistido_cadastro_esta_completo: {
        Args: { a: Database["public"]["Tables"]["assistidos"]["Row"] }
        Returns: boolean
      }
      fn_assumir_solicitacao_comercial: {
        Args: { _id: string }
        Returns: undefined
      }
      fn_atualizar_parametro_operacional: {
        Args: { p_chave: string; p_observacao?: string; p_valor: string }
        Returns: Json
      }
      fn_avisos_ausencia_pendentes:
        | {
            Args: { p_incluir_resolvidos?: boolean }
            Returns: {
              assistido_id: string
              assistido_nome: string
              created_at: string
              data_compromisso: string
              id: string
              motivo: string
              pode_ver_conteudo: boolean
              resolucao: string
              status: string
              tipo_compromisso: string
              tratado_em: string
              tratado_por: string
            }[]
          }
        | {
            Args: { p_incluir_resolvidos: boolean; p_instituicao_id: string }
            Returns: {
              assistido_id: string
              assistido_nome: string
              created_at: string
              data_compromisso: string
              id: string
              motivo: string
              pode_ver_conteudo: boolean
              resolucao: string
              status: string
              tipo_compromisso: string
              tratado_em: string
              tratado_por: string
            }[]
          }
      fn_backfill_fix16_vinculos_voluntarios: { Args: never; Returns: Json }
      fn_buscar_pessoa_para_voluntario:
        | {
            Args: { p_termo: string }
            Returns: {
              bairro: string
              celular: string
              cep: string
              cidade: string
              complemento: string
              cpf: string
              data_nascimento: string
              email: string
              estado: string
              foto_url: string
              ja_voluntario: boolean
              logradouro: string
              nome: string
              numero: string
              origem: string
              origem_id: string
              user_id: string
            }[]
          }
        | {
            Args: { p_instituicao_id: string; p_termo: string }
            Returns: {
              bairro: string
              celular: string
              cep: string
              cidade: string
              complemento: string
              cpf: string
              data_nascimento: string
              email: string
              estado: string
              foto_url: string
              ja_voluntario: boolean
              logradouro: string
              nome: string
              numero: string
              origem: string
              origem_id: string
              user_id: string
            }[]
          }
      fn_chamado_assumir: { Args: { p_chamado_id: string }; Returns: undefined }
      fn_chamado_cancelar: {
        Args: { p_chamado_id: string; p_motivo: string }
        Returns: undefined
      }
      fn_chamado_fechar_administrativo: {
        Args: {
          p_categoria: Database["public"]["Enums"]["chamado_fechamento_categoria"]
          p_chamado_id: string
          p_motivo: string
          p_observacao_interna?: string
        }
        Returns: undefined
      }
      fn_chamado_fechar_cliente: {
        Args: {
          p_atendido: boolean
          p_chamado_id: string
          p_comentario: string
        }
        Returns: undefined
      }
      fn_chamado_marcar_resolvido: {
        Args: {
          p_chamado_id: string
          p_observacao_interna?: string
          p_solucao: string
          p_tipo: Database["public"]["Enums"]["chamado_resolucao_tipo"]
        }
        Returns: undefined
      }
      fn_chamado_reabrir: {
        Args: { p_chamado_id: string; p_motivo: string }
        Returns: undefined
      }
      fn_chamado_solicitar_documento: {
        Args: {
          p_apenas_informacao?: boolean
          p_chamado_id: string
          p_mensagem: string
        }
        Returns: undefined
      }
      fn_conceder_acesso_operacional: {
        Args: {
          p_instituicao_id?: string
          p_motivo?: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_target_user_id: string
        }
        Returns: Json
      }
      fn_confirmacao_agendamento_ativa: { Args: never; Returns: boolean }
      fn_confirmacao_entrevista_ativa: { Args: never; Returns: boolean }
      fn_coordena_tratamento: {
        Args: { _tratamento_id: string; _user_id: string }
        Returns: boolean
      }
      fn_coordenador_pode_ver_assistido: {
        Args: { p_assistido_id: string; p_instituicao_id: string }
        Returns: boolean
      }
      fn_definir_status_vinculo_instituicao: {
        Args: {
          p_status: Database["public"]["Enums"]["saas_vinculo_status"]
          p_vinculo_id: string
        }
        Returns: undefined
      }
      fn_designar_coordenador: {
        Args: { p_coordenador_id: string; p_tratamento_id: string }
        Returns: undefined
      }
      fn_eh_gestor: { Args: { _uid: string }; Returns: boolean }
      fn_eh_proxima_sessao: { Args: { p_agenda_id: string }; Returns: boolean }
      fn_eh_staff: { Args: { _uid: string }; Returns: boolean }
      fn_encerrar_item_fila_erro_cadastro: {
        Args: { p_fila_id: string; p_motivo?: string; p_observacao?: string }
        Returns: Json
      }
      fn_encerrar_item_fila_obsoleto: {
        Args: { p_fila_id: string; p_observacao?: string }
        Returns: Json
      }
      fn_enfileirar_mensagem_manual: {
        Args: {
          p_assistido_id: string
          p_mensagem: string
          p_observacao?: string
        }
        Returns: Json
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
      fn_entrevistas_operacional:
        | {
            Args: { _end?: string; _id?: string; _start?: string }
            Returns: {
              assistido_id: string
              data: string
              entrevistador_id: string
              id: string
              status: string
              tipo_entrevista: string
            }[]
          }
        | {
            Args: {
              _end: string
              _id: string
              _start: string
              p_instituicao_id: string
            }
            Returns: {
              assistido_id: string
              data: string
              entrevistador_id: string
              id: string
              status: string
              tipo_entrevista: string
            }[]
          }
      fn_excecao_alvos: {
        Args: { p_excecao_id: string }
        Returns: {
          assistido_id: string
          compromisso_id: string
          data_impactada: string
          dominio: string
          horario_impactado: string
          nome: string
          sessao_ref: string
          telefone: string
          tratamento: string
          usou_fallback_nome: boolean
        }[]
      }
      fn_fila_diagnostico_pendentes: {
        Args: never
        Returns: {
          id: string
          motivo: string
        }[]
      }
      fn_fila_motivo_inelegivel: {
        Args: { p_fila_id: string }
        Returns: string
      }
      fn_is_admin_instituicao: {
        Args: { _inst_id: string; _user_id: string }
        Returns: boolean
      }
      fn_is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      fn_lembrete_antecedencia_horas: { Args: never; Returns: number }
      fn_lista_espera_coordenador: {
        Args: { p_user_id?: string }
        Returns: {
          assistido_id: string
          assistido_nome: string
          created_at: string
          dia_semana: number
          entrevista_data: string
          entrevista_id: string
          frequencia_unidade: string
          frequencia_valor: number
          horario: string
          id: string
          modo_agendamento: string
          origem: string
          permite_entrada_sem_agendamento: boolean
          prioridade: string
          quantidade_realizada: number
          quantidade_total: number
          status: string
          tem_etapa_ativa_valida: boolean
          tem_sessao_futura_valida: boolean
          trabalho_publico: boolean
          tratamento_id: string
          tratamento_nome: string
          tratamento_tipo: string
          urgencia: string
        }[]
      }
      fn_listar_coordenacao_tratamentos: { Args: never; Returns: Json }
      fn_listar_parametros_operacionais: {
        Args: never
        Returns: {
          alterado_por_nome: string
          ativo: boolean
          chave: string
          confirmacao_reforcada: boolean
          descricao: string
          id: string
          impacto: string
          nome_amigavel: string
          opcoes: Json
          sensivel: boolean
          tipo: string
          updated_at: string
          updated_by: string
          valor: string
          valor_max: number
          valor_min: number
          valor_padrao: string
        }[]
      }
      fn_listar_vinculos_instituicao: {
        Args: { p_instituicao_id: string }
        Returns: {
          created_at: string
          email: string
          nome_completo: string
          papel_local: Database["public"]["Enums"]["saas_papel_local"]
          status: Database["public"]["Enums"]["saas_vinculo_status"]
          updated_at: string
          user_id: string
          vinculo_id: string
        }[]
      }
      fn_monitor_excecao_notificacoes:
        | { Args: { p_desde?: string }; Returns: Json }
        | { Args: { p_desde: string; p_instituicao_id: string }; Returns: Json }
      fn_normalize_phone: { Args: { p: string }; Returns: string }
      fn_notif_ping: { Args: never; Returns: string }
      fn_observabilidade_operacional:
        | { Args: { p_janela?: string }; Returns: Json }
        | {
            Args: { p_instituicao_id?: string; p_janela?: string }
            Returns: Json
          }
      fn_pode_ver_chamado: {
        Args: {
          _chamado_id: string
          _criador: string
          _inst: string
          _user: string
        }
        Returns: boolean
      }
      fn_presenca_classificacao: { Args: { p_status: string }; Returns: Json }
      fn_processar_alertas_comerciais: {
        Args: never
        Returns: {
          id: string
          prioridade: string
          quantidade_alertas: number
        }[]
      }
      fn_processar_excecao_notificacoes:
        | { Args: { p_excecao_id: string }; Returns: Json }
        | {
            Args: { p_excecao_id: string; p_instituicao_id: string }
            Returns: Json
          }
      fn_promover_proxima_sessao: {
        Args: { p_vinculo: string }
        Returns: undefined
      }
      fn_proxima_sessao_vinculo: {
        Args: { p_vinculo: string }
        Returns: string
      }
      fn_reconciliar_excecoes_notificacoes: { Args: never; Returns: Json }
      fn_registrar_aviso_ausencia:
        | {
            Args: {
              p_compromisso_id: string
              p_motivo?: string
              p_tipo_compromisso: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_compromisso_id: string
              p_instituicao_id: string
              p_motivo: string
              p_tipo_compromisso: string
            }
            Returns: Json
          }
      fn_remover_coordenador: {
        Args: { p_coordenador_id: string; p_tratamento_id: string }
        Returns: undefined
      }
      fn_revogar_acesso_operacional: {
        Args: {
          p_motivo?: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_target_user_id: string
        }
        Returns: Json
      }
      fn_saas05_i_log_fallback: {
        Args: {
          p_contexto?: Json
          p_fail_closed?: boolean
          p_fallback: string
          p_motivo: string
          p_origem_tenant?: string
          p_tenant_resolvido?: string
        }
        Returns: undefined
      }
      fn_saas05_i_log_legacy_rpc: {
        Args: {
          p_contexto?: Json
          p_origem?: string
          p_overload_tenant_aware_existe?: boolean
          p_rpc: string
          p_tenant_recebido?: string
        }
        Returns: undefined
      }
      fn_sanear_fila_notificacoes: {
        Args: never
        Returns: {
          r_fila_id: string
          r_motivo: string
        }[]
      }
      fn_solicitacao_proximo_alerta: {
        Args: { _base: string; _qtd: number }
        Returns: string
      }
      fn_tratamentos_do_coordenador: {
        Args: { _user_id?: string }
        Returns: string[]
      }
      fn_tratar_aviso_ausencia:
        | {
            Args: {
              p_aviso_id: string
              p_novo_status: string
              p_resolucao?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_aviso_id: string
              p_instituicao_id: string
              p_novo_status: string
              p_resolucao: string
            }
            Returns: Json
          }
      fn_usuario_e_dono_do_assistido: {
        Args: { p_assistido_id: string }
        Returns: boolean
      }
      fn_vincular_usuario_instituicao: {
        Args: {
          p_email: string
          p_instituicao_id: string
          p_papel_local?: Database["public"]["Enums"]["saas_papel_local"]
          p_status?: Database["public"]["Enums"]["saas_vinculo_status"]
        }
        Returns: Json
      }
      fn_voluntario_cadastro_completo: {
        Args: {
          p_bairro: string
          p_celular: string
          p_cep: string
          p_cidade: string
          p_cpf: string
          p_data_nascimento: string
          p_email: string
          p_estado: string
          p_logradouro: string
          p_nome: string
          p_numero: string
        }
        Returns: boolean
      }
      fn_voluntario_pendencias_cadastro: {
        Args: { p_voluntario_id: string }
        Returns: string[]
      }
      fn_voluntarios_orfaos_do_tenant: {
        Args: { p_instituicao_id: string }
        Returns: {
          celular: string
          cpf: string
          created_at: string
          email: string
          nome_completo: string
          possui_email: boolean
          status: string
          tipos_voluntario: string[]
          voluntario_id: string
        }[]
      }
      gerenciar_termo_voluntario:
        | {
            Args: {
              p_action: string
              p_motivo?: string
              p_nome?: string
              p_path?: string
              p_voluntario_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_action: string
              p_instituicao_id: string
              p_motivo: string
              p_nome: string
              p_path: string
              p_voluntario_id: string
            }
            Returns: Json
          }
      gerenciar_voluntario:
        | {
            Args: {
              p_action: string
              p_motivo?: string
              p_voluntario_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_action: string
              p_instituicao_id: string
              p_motivo: string
              p_voluntario_id: string
            }
            Returns: Json
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_instituicao: {
        Args: {
          _instituicao_id: string
          _papel: Database["public"]["Enums"]["saas_papel_local"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_admin: { Args: { _uid: string }; Returns: boolean }
      is_active_master: { Args: { _uid: string }; Returns: boolean }
      is_member_of_instituicao: {
        Args: { _instituicao_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      lista_usuarios_email: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      marcar_envio_concluido: {
        Args: { p_comunicacao_id: string }
        Returns: Json
      }
      metricas_ia_whatsapp:
        | { Args: { p_fim: string; p_inicio: string }; Returns: Json }
        | {
            Args: { p_fim: string; p_inicio: string; p_instituicao_id?: string }
            Returns: Json
          }
      migrar_assistido_legado_tratamento: {
        Args: { p_assistido_id: string; p_tratamentos: Json }
        Returns: Json
      }
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
      preparar_envio_institucional: {
        Args: {
          p_comunicacao_id: string
          p_janela_dias?: number
          p_versao: string
        }
        Returns: Json
      }
      pts_converter_assistido:
        | { Args: { p_assistido_id: string; p_planos: Json }; Returns: Json }
        | {
            Args: {
              p_assistido_id: string
              p_instituicao_id: string
              p_planos: Json
            }
            Returns: Json
          }
      pts_homologacao_auditar:
        | {
            Args: { p_acao: string; p_assistido_id: string; p_resultado?: Json }
            Returns: Json
          }
        | {
            Args: {
              p_acao: string
              p_assistido_id: string
              p_instituicao_id: string
              p_resultado: Json
            }
            Returns: undefined
          }
      pts_persistir_plano:
        | {
            Args: {
              p_etapas: Json
              p_sessao_ativa?: Json
              p_vinculo_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_etapas: Json
              p_instituicao_id: string
              p_sessao_ativa: Json
              p_vinculo_id: string
            }
            Returns: undefined
          }
      pts_registrar_ausencia:
        | {
            Args: {
              p_data: string
              p_nova_data?: string
              p_nova_horario?: string
              p_registrado_por: string
              p_vinculo_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_data: string
              p_instituicao_id: string
              p_nova_data: string
              p_nova_horario: string
              p_registrado_por: string
              p_vinculo_id: string
            }
            Returns: Json
          }
      pts_registrar_presenca:
        | {
            Args: {
              p_data: string
              p_proxima_data?: string
              p_proxima_horario?: string
              p_proxima_numero_etapa?: number
              p_registrado_por: string
              p_vinculo_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_data: string
              p_instituicao_id: string
              p_proxima_data: string
              p_proxima_horario: string
              p_proxima_numero_etapa: number
              p_registrado_por: string
              p_vinculo_id: string
            }
            Returns: Json
          }
      pts_rollback_piloto:
        | { Args: { p_assistido_id: string }; Returns: Json }
        | {
            Args: { p_assistido_id: string; p_instituicao_id: string }
            Returns: Json
          }
      registrar_auditoria_reconciliacao: {
        Args: { p_assistido_id: string; p_dados: Json }
        Returns: string
      }
      registrar_presenca:
        | {
            Args: {
              p_assistido_tratamento_id: string
              p_data: string
              p_observacao?: string
              p_registrado_por: string
              p_status_presenca: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_assistido_tratamento_id: string
              p_data: string
              p_instituicao_id: string
              p_observacao: string
              p_registrado_por: string
              p_status_presenca: string
            }
            Returns: undefined
          }
      relatorio_carga_tarefeiro:
        | {
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
        | {
            Args: {
              p_data_fim: string
              p_data_inicio: string
              p_instituicao_id?: string
              p_page?: number
              p_page_size?: number
              p_tarefeiro_id?: string
              p_tratamento_id?: string
            }
            Returns: Json
          }
      relatorio_faltas_periodo:
        | {
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
        | {
            Args: {
              p_assistido_id?: string
              p_coordenador_id?: string
              p_data_fim: string
              p_data_inicio: string
              p_instituicao_id?: string
              p_page?: number
              p_page_size?: number
              p_tarefeiro_id?: string
              p_tratamento_id?: string
            }
            Returns: Json
          }
      relatorio_frequencia_presenca:
        | {
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
        | {
            Args: {
              p_assistido_id?: string
              p_coordenador_id?: string
              p_data_fim: string
              p_data_inicio: string
              p_instituicao_id?: string
              p_page?: number
              p_page_size?: number
              p_tarefeiro_id?: string
              p_tratamento_id?: string
            }
            Returns: Json
          }
      relatorio_tratamentos_concluidos:
        | {
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
        | {
            Args: {
              p_coordenador_id?: string
              p_data_fim: string
              p_data_inicio: string
              p_instituicao_id?: string
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
      sou_comunicador_elegivel: { Args: never; Returns: boolean }
      staff_names: {
        Args: { _ids?: string[] }
        Returns: {
          nome_completo: string
          user_id: string
        }[]
      }
      user_is_admin_instituicao: {
        Args: { _instituicao_id: string; _user_id: string }
        Returns: boolean
      }
      user_pertence_instituicao: {
        Args: { _instituicao_id: string; _user_id: string }
        Returns: boolean
      }
      user_tem_papel_local: {
        Args: {
          _instituicao_id: string
          _papel: Database["public"]["Enums"]["saas_papel_local"]
          _user_id: string
        }
        Returns: boolean
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
      chamado_fechamento_categoria:
        | "sem_retorno_cliente"
        | "duplicidade"
        | "chamado_cancelado"
        | "fora_do_escopo"
        | "resolvido_sem_confirmacao"
        | "erro_nao_reproduzido"
        | "outro"
      chamado_prioridade: "baixa" | "normal" | "alta" | "critica"
      chamado_resolucao_tipo:
        | "correcao_tecnica_aplicada"
        | "orientacao_operacional"
        | "configuracao_ajustada"
        | "documento_recebido"
        | "solicitacao_comercial_tratada"
        | "nao_reproduzido"
        | "fora_do_escopo"
        | "duplicidade"
        | "outro"
      chamado_status:
        | "aberto"
        | "em_analise"
        | "aguardando_cliente"
        | "aguardando_administrador_global"
        | "aguardando_documento"
        | "resolvido"
        | "cancelado"
        | "resolvido_pelo_suporte"
        | "reaberto"
        | "fechado_pelo_cliente"
        | "fechado_administrativo"
      chamado_tipo:
        | "tecnico"
        | "operacional"
        | "comercial"
        | "cobranca"
        | "contrato_documento"
        | "melhoria"
        | "incidente"
      chamado_visibilidade: "instituicao" | "autor_e_platform_admin"
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
        | "presenca_registrada"
        | "falta_registrada"
        | "sessao_cancelada_por_excecao"
        | "sessao_remarcada_por_excecao"
        | "entrevista_cancelada_por_excecao"
        | "entrevista_remarcada_por_excecao"
        | "publico_cancelado_por_excecao"
        | "publico_remarcado_por_excecao"
        | "mensagem_manual"
        | "aviso_ausencia_recebido"
      notif_status: "pendente" | "agendado" | "enviado" | "falha" | "cancelado"
      saas_assinatura_status:
        | "trial"
        | "ativa"
        | "suspensa"
        | "cancelada"
        | "inadimplente"
        | "encerrada"
      saas_classificacao_comercial:
        | "demo"
        | "piloto"
        | "producao_assistida"
        | "cliente_ativo"
      saas_instituicao_status: "implantacao" | "ativa" | "inativa" | "suspensa"
      saas_papel_global:
        | "platform_owner"
        | "platform_admin"
        | "support"
        | "billing_admin"
      saas_papel_local:
        | "admin_instituicao"
        | "coordenador"
        | "entrevistador"
        | "tarefeiro"
        | "assistido"
        | "leitor"
        | "caixa"
        | "bibliotecario"
      saas_vinculo_status: "pendente" | "ativo" | "inativo"
      status_etapa_plano:
        | "prevista"
        | "ativa"
        | "realizada"
        | "ausente"
        | "suspensa"
        | "cancelada"
        | "liberada_para_comparecimento_publico"
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
      chamado_fechamento_categoria: [
        "sem_retorno_cliente",
        "duplicidade",
        "chamado_cancelado",
        "fora_do_escopo",
        "resolvido_sem_confirmacao",
        "erro_nao_reproduzido",
        "outro",
      ],
      chamado_prioridade: ["baixa", "normal", "alta", "critica"],
      chamado_resolucao_tipo: [
        "correcao_tecnica_aplicada",
        "orientacao_operacional",
        "configuracao_ajustada",
        "documento_recebido",
        "solicitacao_comercial_tratada",
        "nao_reproduzido",
        "fora_do_escopo",
        "duplicidade",
        "outro",
      ],
      chamado_status: [
        "aberto",
        "em_analise",
        "aguardando_cliente",
        "aguardando_administrador_global",
        "aguardando_documento",
        "resolvido",
        "cancelado",
        "resolvido_pelo_suporte",
        "reaberto",
        "fechado_pelo_cliente",
        "fechado_administrativo",
      ],
      chamado_tipo: [
        "tecnico",
        "operacional",
        "comercial",
        "cobranca",
        "contrato_documento",
        "melhoria",
        "incidente",
      ],
      chamado_visibilidade: ["instituicao", "autor_e_platform_admin"],
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
        "presenca_registrada",
        "falta_registrada",
        "sessao_cancelada_por_excecao",
        "sessao_remarcada_por_excecao",
        "entrevista_cancelada_por_excecao",
        "entrevista_remarcada_por_excecao",
        "publico_cancelado_por_excecao",
        "publico_remarcado_por_excecao",
        "mensagem_manual",
        "aviso_ausencia_recebido",
      ],
      notif_status: ["pendente", "agendado", "enviado", "falha", "cancelado"],
      saas_assinatura_status: [
        "trial",
        "ativa",
        "suspensa",
        "cancelada",
        "inadimplente",
        "encerrada",
      ],
      saas_classificacao_comercial: [
        "demo",
        "piloto",
        "producao_assistida",
        "cliente_ativo",
      ],
      saas_instituicao_status: ["implantacao", "ativa", "inativa", "suspensa"],
      saas_papel_global: [
        "platform_owner",
        "platform_admin",
        "support",
        "billing_admin",
      ],
      saas_papel_local: [
        "admin_instituicao",
        "coordenador",
        "entrevistador",
        "tarefeiro",
        "assistido",
        "leitor",
        "caixa",
        "bibliotecario",
      ],
      saas_vinculo_status: ["pendente", "ativo", "inativo"],
      status_etapa_plano: [
        "prevista",
        "ativa",
        "realizada",
        "ausente",
        "suspensa",
        "cancelada",
        "liberada_para_comparecimento_publico",
      ],
    },
  },
} as const
