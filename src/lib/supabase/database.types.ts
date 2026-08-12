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
      aditivos: {
        Row: {
          cliente_id: string
          contrato_base_id: string
          created_at: string
          descricao: string | null
          id: string
          status: Database["public"]["Enums"]["contract_status"]
          titulo: string
          updated_at: string
          versao_origem_id: string | null
          versao_resultante_id: string | null
        }
        Insert: {
          cliente_id: string
          contrato_base_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          status?: Database["public"]["Enums"]["contract_status"]
          titulo: string
          updated_at?: string
          versao_origem_id?: string | null
          versao_resultante_id?: string | null
        }
        Update: {
          cliente_id?: string
          contrato_base_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          status?: Database["public"]["Enums"]["contract_status"]
          titulo?: string
          updated_at?: string
          versao_origem_id?: string | null
          versao_resultante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aditivos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aditivos_contrato_base_id_fkey"
            columns: ["contrato_base_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aditivos_versao_origem_id_fkey"
            columns: ["versao_origem_id"]
            isOneToOne: false
            referencedRelation: "contrato_versoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aditivos_versao_resultante_id_fkey"
            columns: ["versao_resultante_id"]
            isOneToOne: false
            referencedRelation: "contrato_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          area: string | null
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          area?: string | null
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          area?: string | null
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      clientes: {
        Row: {
          created_at: string
          documento: string
          email_principal: string
          id: string
          razao_social: string
          telefone_principal: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          documento: string
          email_principal: string
          id?: string
          razao_social: string
          telefone_principal?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          documento?: string
          email_principal?: string
          id?: string
          razao_social?: string
          telefone_principal?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contatos_cliente: {
        Row: {
          cargo: string | null
          cliente_id: string
          created_at: string
          email: string | null
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          cargo?: string | null
          cliente_id: string
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
        }
        Update: {
          cargo?: string | null
          cliente_id?: string
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_clause_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_clause_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_review_tasks: {
        Row: {
          assigned_to: string | null
          concluido_em: string | null
          created_at: string
          created_by: string | null
          id: string
          notificado_em: string | null
          observacao: string | null
          oportunidade_id: string
          prazo_revisao: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notificado_em?: string | null
          observacao?: string | null
          oportunidade_id: string
          prazo_revisao?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notificado_em?: string | null
          observacao?: string | null
          oportunidade_id?: string
          prazo_revisao?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_review_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_tasks_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: true
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          antecedencia_faturamento_dias: number
          ativado_em: string | null
          ativado_por: string | null
          atualizado_por: string | null
          cliente_id: string | null
          created_at: string
          criado_por: string | null
          data_assinatura: string | null
          data_alerta_renovacao: string | null
          data_base_renovacao: string | null
          d4sign_document_id: string | null
          dia_vencimento: number | null
          encerrado_em: string | null
          encerrado_por: string | null
          etiquetas: string[]
          id: string
          ignorar_painel_horas: boolean
          indice_reajuste: string | null
          link_documento: string | null
          oportunidade_id: string | null
          prazo_indeterminado: boolean
          primeiro_faturamento_condicionado: boolean
          primeiro_vencimento: string | null
          sharepoint_referencia: string | null
          sharepoint_url: string | null
          status: Database["public"]["Enums"]["contract_lifecycle_status"]
          status_assinatura: Database["public"]["Enums"]["contract_status"]
          suspenso_em: string | null
          suspenso_por: string | null
          titulo: string
          updated_at: string
          valor_anual_override: number | null
          valor_anual_override_motivo: string | null
          valor_anual_referencia: number | null
          versao_ativa_id: string | null
          vigente_ate: string | null
          vigente_de: string | null
          vios_referencia: string | null
          vios_url: string | null
        }
        Insert: {
          antecedencia_faturamento_dias?: number
          ativado_em?: string | null
          ativado_por?: string | null
          atualizado_por?: string | null
          cliente_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_alerta_renovacao?: string | null
          data_base_renovacao?: string | null
          d4sign_document_id?: string | null
          dia_vencimento?: number | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          etiquetas?: string[]
          id?: string
          ignorar_painel_horas?: boolean
          indice_reajuste?: string | null
          link_documento?: string | null
          oportunidade_id?: string | null
          prazo_indeterminado?: boolean
          primeiro_faturamento_condicionado?: boolean
          primeiro_vencimento?: string | null
          sharepoint_referencia?: string | null
          sharepoint_url?: string | null
          status?: Database["public"]["Enums"]["contract_lifecycle_status"]
          status_assinatura?: Database["public"]["Enums"]["contract_status"]
          suspenso_em?: string | null
          suspenso_por?: string | null
          titulo: string
          updated_at?: string
          valor_anual_override?: number | null
          valor_anual_override_motivo?: string | null
          valor_anual_referencia?: number | null
          versao_ativa_id?: string | null
          vigente_ate?: string | null
          vigente_de?: string | null
          vios_referencia?: string | null
          vios_url?: string | null
        }
        Update: {
          antecedencia_faturamento_dias?: number
          ativado_em?: string | null
          ativado_por?: string | null
          atualizado_por?: string | null
          cliente_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_alerta_renovacao?: string | null
          data_base_renovacao?: string | null
          d4sign_document_id?: string | null
          dia_vencimento?: number | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          etiquetas?: string[]
          id?: string
          ignorar_painel_horas?: boolean
          indice_reajuste?: string | null
          link_documento?: string | null
          oportunidade_id?: string | null
          prazo_indeterminado?: boolean
          primeiro_faturamento_condicionado?: boolean
          primeiro_vencimento?: string | null
          sharepoint_referencia?: string | null
          sharepoint_url?: string | null
          status?: Database["public"]["Enums"]["contract_lifecycle_status"]
          status_assinatura?: Database["public"]["Enums"]["contract_status"]
          suspenso_em?: string | null
          suspenso_por?: string | null
          titulo?: string
          updated_at?: string
          valor_anual_override?: number | null
          valor_anual_override_motivo?: string | null
          valor_anual_referencia?: number | null
          versao_ativa_id?: string | null
          vigente_ate?: string | null
          vigente_de?: string | null
          vios_referencia?: string | null
          vios_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_ativado_por_fkey"
            columns: ["ativado_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_d4sign_document_id_fkey"
            columns: ["d4sign_document_id"]
            isOneToOne: false
            referencedRelation: "d4sign_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: true
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_suspenso_por_fkey"
            columns: ["suspenso_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_versao_ativa_id_fkey"
            columns: ["versao_ativa_id"]
            isOneToOne: false
            referencedRelation: "contrato_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_alertas: {
        Row: {
          cliente_notificado_em: string | null
          cliente_notificado_por: string | null
          contrato_id: string
          created_at: string
          data_base: string | null
          data_vencimento: string | null
          decisao: string | null
          fechamento_id: string | null
          id: string
          idempotency_key: string
          responsavel_app_user_id: string | null
          resolucao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          cliente_notificado_em?: string | null
          cliente_notificado_por?: string | null
          contrato_id: string
          created_at?: string
          data_base?: string | null
          data_vencimento?: string | null
          decisao?: string | null
          fechamento_id?: string | null
          id?: string
          idempotency_key: string
          responsavel_app_user_id?: string | null
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          cliente_notificado_em?: string | null
          cliente_notificado_por?: string | null
          contrato_id?: string
          created_at?: string
          data_base?: string | null
          data_vencimento?: string | null
          decisao?: string | null
          fechamento_id?: string | null
          id?: string
          idempotency_key?: string
          responsavel_app_user_id?: string | null
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "contrato_alertas_cliente_notificado_por_fkey"; columns: ["cliente_notificado_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_alertas_contrato_id_fkey"; columns: ["contrato_id"]; isOneToOne: false; referencedRelation: "contratos"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_alertas_fechamento_id_fkey"; columns: ["fechamento_id"]; isOneToOne: false; referencedRelation: "contrato_fechamentos"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_alertas_resolvido_por_fkey"; columns: ["resolvido_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_alertas_responsavel_app_user_id_fkey"; columns: ["responsavel_app_user_id"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
        ]
      }
      contrato_areas: {
        Row: {
          acompanha_horas: boolean
          acompanha_processos: boolean
          area_key: string
          created_at: string
          horas_incluidas: number | null
          id: string
          observacoes: string | null
          processos_incluidos: number | null
          updated_at: string
          valor_excedente_hora: number | null
          valor_excedente_processo: number | null
          valor_km: number | null
          versao_id: string
        }
        Insert: {
          acompanha_horas?: boolean
          acompanha_processos?: boolean
          area_key: string
          created_at?: string
          horas_incluidas?: number | null
          id?: string
          observacoes?: string | null
          processos_incluidos?: number | null
          updated_at?: string
          valor_excedente_hora?: number | null
          valor_excedente_processo?: number | null
          valor_km?: number | null
          versao_id: string
        }
        Update: {
          acompanha_horas?: boolean
          acompanha_processos?: boolean
          area_key?: string
          created_at?: string
          horas_incluidas?: number | null
          id?: string
          observacoes?: string | null
          processos_incluidos?: number | null
          updated_at?: string
          valor_excedente_hora?: number | null
          valor_excedente_processo?: number | null
          valor_km?: number | null
          versao_id?: string
        }
        Relationships: [
          { foreignKeyName: "contrato_areas_versao_id_fkey"; columns: ["versao_id"]; isOneToOne: false; referencedRelation: "contrato_versoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_comissoes: {
        Row: {
          base_calculo: string
          beneficiario_app_user_id: string | null
          beneficiario_nome: string
          componente_id: string | null
          created_at: string
          id: string
          motivo: string | null
          percentual: number | null
          periodo_fim: string | null
          periodo_inicio: string | null
          updated_at: string
          valor: number | null
          versao_id: string
        }
        Insert: {
          base_calculo: string
          beneficiario_app_user_id?: string | null
          beneficiario_nome: string
          componente_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          percentual?: number | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          updated_at?: string
          valor?: number | null
          versao_id: string
        }
        Update: {
          base_calculo?: string
          beneficiario_app_user_id?: string | null
          beneficiario_nome?: string
          componente_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          percentual?: number | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          updated_at?: string
          valor?: number | null
          versao_id?: string
        }
        Relationships: [
          { foreignKeyName: "contrato_comissoes_beneficiario_app_user_id_fkey"; columns: ["beneficiario_app_user_id"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_comissoes_componente_id_fkey"; columns: ["componente_id"]; isOneToOne: false; referencedRelation: "contrato_componentes_cobranca"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_comissoes_versao_id_fkey"; columns: ["versao_id"]; isOneToOne: false; referencedRelation: "contrato_versoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_componentes_cobranca: {
        Row: {
          area_id: string | null
          base_calculo: string | null
          condicao_liberacao: string | null
          created_at: string
          descricao: string
          elegivel_comissao: boolean
          elegivel_participacao: boolean
          elegivel_rateio: boolean
          grupo_faixa_id: string | null
          id: string
          liberacao_manual_necessaria: boolean
          liberado_em: string | null
          liberado_por: string | null
          modo_cobranca_variavel: string | null
          ordem: number
          percentual: number | null
          periodo_fim: string | null
          periodo_inicio: string | null
          quantidade_incluida: number | null
          recorrencia: string | null
          tipo: string
          tratamento_tributario: string | null
          updated_at: string
          valor_fixo: number | null
          valor_unitario: number | null
          versao_id: string
        }
        Insert: {
          area_id?: string | null
          base_calculo?: string | null
          condicao_liberacao?: string | null
          created_at?: string
          descricao: string
          elegivel_comissao?: boolean
          elegivel_participacao?: boolean
          elegivel_rateio?: boolean
          grupo_faixa_id?: string | null
          id?: string
          liberacao_manual_necessaria?: boolean
          liberado_em?: string | null
          liberado_por?: string | null
          modo_cobranca_variavel?: string | null
          ordem?: number
          percentual?: number | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          quantidade_incluida?: number | null
          recorrencia?: string | null
          tipo: string
          tratamento_tributario?: string | null
          updated_at?: string
          valor_fixo?: number | null
          valor_unitario?: number | null
          versao_id: string
        }
        Update: {
          area_id?: string | null
          base_calculo?: string | null
          condicao_liberacao?: string | null
          created_at?: string
          descricao?: string
          elegivel_comissao?: boolean
          elegivel_participacao?: boolean
          elegivel_rateio?: boolean
          grupo_faixa_id?: string | null
          id?: string
          liberacao_manual_necessaria?: boolean
          liberado_em?: string | null
          liberado_por?: string | null
          modo_cobranca_variavel?: string | null
          ordem?: number
          percentual?: number | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          quantidade_incluida?: number | null
          recorrencia?: string | null
          tipo?: string
          tratamento_tributario?: string | null
          updated_at?: string
          valor_fixo?: number | null
          valor_unitario?: number | null
          versao_id?: string
        }
        Relationships: [
          { foreignKeyName: "contrato_componentes_cobranca_area_id_fkey"; columns: ["area_id"]; isOneToOne: false; referencedRelation: "contrato_areas"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_componentes_cobranca_liberado_por_fkey"; columns: ["liberado_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_componentes_cobranca_versao_id_fkey"; columns: ["versao_id"]; isOneToOne: false; referencedRelation: "contrato_versoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_consumos_mensais: {
        Row: {
          area_id: string | null
          competencia: string
          componente_id: string | null
          contrato_id: string
          created_at: string
          evidencia_url: string | null
          id: string
          informado_por: string | null
          observacao: string | null
          quantidade: number | null
          tipo: string
          updated_at: string
          valor: number | null
          versao_id: string
        }
        Insert: {
          area_id?: string | null
          competencia: string
          componente_id?: string | null
          contrato_id: string
          created_at?: string
          evidencia_url?: string | null
          id?: string
          informado_por?: string | null
          observacao?: string | null
          quantidade?: number | null
          tipo: string
          updated_at?: string
          valor?: number | null
          versao_id: string
        }
        Update: {
          area_id?: string | null
          competencia?: string
          componente_id?: string | null
          contrato_id?: string
          created_at?: string
          evidencia_url?: string | null
          id?: string
          informado_por?: string | null
          observacao?: string | null
          quantidade?: number | null
          tipo?: string
          updated_at?: string
          valor?: number | null
          versao_id?: string
        }
        Relationships: [
          { foreignKeyName: "contrato_consumos_mensais_area_id_fkey"; columns: ["area_id"]; isOneToOne: false; referencedRelation: "contrato_areas"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_consumos_mensais_componente_id_fkey"; columns: ["componente_id"]; isOneToOne: false; referencedRelation: "contrato_componentes_cobranca"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_consumos_mensais_contrato_id_fkey"; columns: ["contrato_id"]; isOneToOne: false; referencedRelation: "contratos"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_consumos_mensais_informado_por_fkey"; columns: ["informado_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_consumos_mensais_versao_id_fkey"; columns: ["versao_id"]; isOneToOne: false; referencedRelation: "contrato_versoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_eventos: {
        Row: {
          ator_app_user_id: string | null
          contrato_id: string
          created_at: string
          detalhe: string | null
          id: string
          idempotency_key: string | null
          metadados_snapshot: Json
          origem: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ator_app_user_id?: string | null
          contrato_id: string
          created_at?: string
          detalhe?: string | null
          id?: string
          idempotency_key?: string | null
          metadados_snapshot?: Json
          origem?: string | null
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ator_app_user_id?: string | null
          contrato_id?: string
          created_at?: string
          detalhe?: string | null
          id?: string
          idempotency_key?: string | null
          metadados_snapshot?: Json
          origem?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "contrato_eventos_ator_app_user_id_fkey"; columns: ["ator_app_user_id"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_eventos_contrato_id_fkey"; columns: ["contrato_id"]; isOneToOne: false; referencedRelation: "contratos"; referencedColumns: ["id"] },
        ]
      }
      contrato_fechamento_itens: {
        Row: {
          area_id: string | null
          bloqueante: boolean
          bloqueio_descricao: string | null
          bloqueio_tipo: string | null
          componente_id: string | null
          created_at: string
          descricao: string
          elegivel_comissao: boolean
          elegivel_participacao: boolean
          elegivel_rateio: boolean
          id: string
          metadados: Json
          percentual: number | null
          quantidade: number | null
          resolucao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          revisao_id: string
          tarifa: number | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          area_id?: string | null
          bloqueante?: boolean
          bloqueio_descricao?: string | null
          bloqueio_tipo?: string | null
          componente_id?: string | null
          created_at?: string
          descricao: string
          elegivel_comissao?: boolean
          elegivel_participacao?: boolean
          elegivel_rateio?: boolean
          id?: string
          metadados?: Json
          percentual?: number | null
          quantidade?: number | null
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          revisao_id: string
          tarifa?: number | null
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          area_id?: string | null
          bloqueante?: boolean
          bloqueio_descricao?: string | null
          bloqueio_tipo?: string | null
          componente_id?: string | null
          created_at?: string
          descricao?: string
          elegivel_comissao?: boolean
          elegivel_participacao?: boolean
          elegivel_rateio?: boolean
          id?: string
          metadados?: Json
          percentual?: number | null
          quantidade?: number | null
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          revisao_id?: string
          tarifa?: number | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          { foreignKeyName: "contrato_fechamento_itens_area_id_fkey"; columns: ["area_id"]; isOneToOne: false; referencedRelation: "contrato_areas"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamento_itens_componente_id_fkey"; columns: ["componente_id"]; isOneToOne: false; referencedRelation: "contrato_componentes_cobranca"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamento_itens_resolvido_por_fkey"; columns: ["resolvido_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamento_itens_revisao_id_fkey"; columns: ["revisao_id"]; isOneToOne: false; referencedRelation: "contrato_fechamento_revisoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_fechamento_revisoes: {
        Row: {
          aprovada_em: string | null
          aprovada_por: string | null
          calculada_em: string | null
          calculada_por: string | null
          created_at: string
          fechamento_id: string
          id: string
          lancada_vios_em: string | null
          lancada_vios_por: string | null
          motivo_correcao: string | null
          numero: number
          revisao_anterior_id: string | null
          status: Database["public"]["Enums"]["contract_closing_status"]
          total_geral: number
          total_honorarios: number
          total_reembolsos: number
          total_tributos: number
          updated_at: string
          vios_referencia: string | null
          vios_url: string | null
        }
        Insert: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          calculada_em?: string | null
          calculada_por?: string | null
          created_at?: string
          fechamento_id: string
          id?: string
          lancada_vios_em?: string | null
          lancada_vios_por?: string | null
          motivo_correcao?: string | null
          numero: number
          revisao_anterior_id?: string | null
          status?: Database["public"]["Enums"]["contract_closing_status"]
          total_geral?: number
          total_honorarios?: number
          total_reembolsos?: number
          total_tributos?: number
          updated_at?: string
          vios_referencia?: string | null
          vios_url?: string | null
        }
        Update: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          calculada_em?: string | null
          calculada_por?: string | null
          created_at?: string
          fechamento_id?: string
          id?: string
          lancada_vios_em?: string | null
          lancada_vios_por?: string | null
          motivo_correcao?: string | null
          numero?: number
          revisao_anterior_id?: string | null
          status?: Database["public"]["Enums"]["contract_closing_status"]
          total_geral?: number
          total_honorarios?: number
          total_reembolsos?: number
          total_tributos?: number
          updated_at?: string
          vios_referencia?: string | null
          vios_url?: string | null
        }
        Relationships: [
          { foreignKeyName: "contrato_fechamento_revisoes_aprovada_por_fkey"; columns: ["aprovada_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamento_revisoes_calculada_por_fkey"; columns: ["calculada_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamento_revisoes_fechamento_id_fkey"; columns: ["fechamento_id"]; isOneToOne: false; referencedRelation: "contrato_fechamentos"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamento_revisoes_lancada_vios_por_fkey"; columns: ["lancada_vios_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamento_revisoes_revisao_anterior_id_fkey"; columns: ["revisao_anterior_id"]; isOneToOne: false; referencedRelation: "contrato_fechamento_revisoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_fechamentos: {
        Row: {
          competencia: string
          contrato_id: string
          created_at: string
          id: string
          preparado_em: string | null
          preparado_por: string | null
          revisao_atual_id: string | null
          status: Database["public"]["Enums"]["contract_closing_status"]
          updated_at: string
          versao_id: string
        }
        Insert: {
          competencia: string
          contrato_id: string
          created_at?: string
          id?: string
          preparado_em?: string | null
          preparado_por?: string | null
          revisao_atual_id?: string | null
          status?: Database["public"]["Enums"]["contract_closing_status"]
          updated_at?: string
          versao_id: string
        }
        Update: {
          competencia?: string
          contrato_id?: string
          created_at?: string
          id?: string
          preparado_em?: string | null
          preparado_por?: string | null
          revisao_atual_id?: string | null
          status?: Database["public"]["Enums"]["contract_closing_status"]
          updated_at?: string
          versao_id?: string
        }
        Relationships: [
          { foreignKeyName: "contrato_fechamentos_contrato_id_fkey"; columns: ["contrato_id"]; isOneToOne: false; referencedRelation: "contratos"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamentos_preparado_por_fkey"; columns: ["preparado_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamentos_revisao_atual_id_fkey"; columns: ["revisao_atual_id"]; isOneToOne: false; referencedRelation: "contrato_fechamento_revisoes"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_fechamentos_versao_id_fkey"; columns: ["versao_id"]; isOneToOne: false; referencedRelation: "contrato_versoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_parcelas: {
        Row: { competencia: string; componente_id: string; created_at: string; id: string; numero: number; updated_at: string; valor: number; vencimento: string }
        Insert: { competencia: string; componente_id: string; created_at?: string; id?: string; numero: number; updated_at?: string; valor: number; vencimento: string }
        Update: { competencia?: string; componente_id?: string; created_at?: string; id?: string; numero?: number; updated_at?: string; valor?: number; vencimento?: string }
        Relationships: [
          { foreignKeyName: "contrato_parcelas_componente_id_fkey"; columns: ["componente_id"]; isOneToOne: false; referencedRelation: "contrato_componentes_cobranca"; referencedColumns: ["id"] },
        ]
      }
      contrato_participacoes_socios: {
        Row: { componente_id: string | null; created_at: string; id: string; override_motivo: string | null; percentual: number; regra_sugerida: string | null; socio_app_user_id: string | null; socio_nome: string; updated_at: string; versao_id: string }
        Insert: { componente_id?: string | null; created_at?: string; id?: string; override_motivo?: string | null; percentual: number; regra_sugerida?: string | null; socio_app_user_id?: string | null; socio_nome: string; updated_at?: string; versao_id: string }
        Update: { componente_id?: string | null; created_at?: string; id?: string; override_motivo?: string | null; percentual?: number; regra_sugerida?: string | null; socio_app_user_id?: string | null; socio_nome?: string; updated_at?: string; versao_id?: string }
        Relationships: [
          { foreignKeyName: "contrato_participacoes_socios_componente_id_fkey"; columns: ["componente_id"]; isOneToOne: false; referencedRelation: "contrato_componentes_cobranca"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_participacoes_socios_socio_app_user_id_fkey"; columns: ["socio_app_user_id"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_participacoes_socios_versao_id_fkey"; columns: ["versao_id"]; isOneToOne: false; referencedRelation: "contrato_versoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_rateios_area: {
        Row: { area_id: string; componente_id: string | null; created_at: string; id: string; modo: string; percentual: number | null; updated_at: string; valor: number | null; versao_id: string }
        Insert: { area_id: string; componente_id?: string | null; created_at?: string; id?: string; modo: string; percentual?: number | null; updated_at?: string; valor?: number | null; versao_id: string }
        Update: { area_id?: string; componente_id?: string | null; created_at?: string; id?: string; modo?: string; percentual?: number | null; updated_at?: string; valor?: number | null; versao_id?: string }
        Relationships: [
          { foreignKeyName: "contrato_rateios_area_area_id_fkey"; columns: ["area_id"]; isOneToOne: false; referencedRelation: "contrato_areas"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_rateios_area_componente_id_fkey"; columns: ["componente_id"]; isOneToOne: false; referencedRelation: "contrato_componentes_cobranca"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_rateios_area_versao_id_fkey"; columns: ["versao_id"]; isOneToOne: false; referencedRelation: "contrato_versoes"; referencedColumns: ["id"] },
        ]
      }
      contrato_responsaveis: {
        Row: { app_user_id: string | null; cargo: string | null; contrato_id: string; created_at: string; email: string | null; id: string; nome: string; papel: string; telefone: string | null; updated_at: string }
        Insert: { app_user_id?: string | null; cargo?: string | null; contrato_id: string; created_at?: string; email?: string | null; id?: string; nome: string; papel: string; telefone?: string | null; updated_at?: string }
        Update: { app_user_id?: string | null; cargo?: string | null; contrato_id?: string; created_at?: string; email?: string | null; id?: string; nome?: string; papel?: string; telefone?: string | null; updated_at?: string }
        Relationships: [
          { foreignKeyName: "contrato_responsaveis_app_user_id_fkey"; columns: ["app_user_id"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_responsaveis_contrato_id_fkey"; columns: ["contrato_id"]; isOneToOne: false; referencedRelation: "contratos"; referencedColumns: ["id"] },
        ]
      }
      contrato_versoes: {
        Row: {
          ativada_em: string | null
          ativada_por: string | null
          atualizado_por: string | null
          contrato_id: string
          created_at: string
          criado_por: string | null
          id: string
          numero: number
          origem_snapshot: Json
          status: Database["public"]["Enums"]["contract_version_status"]
          substituida_em: string | null
          substituida_por: string | null
          updated_at: string
          vigente_ate: string | null
          vigente_de: string | null
        }
        Insert: {
          ativada_em?: string | null
          ativada_por?: string | null
          atualizado_por?: string | null
          contrato_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          numero: number
          origem_snapshot?: Json
          status?: Database["public"]["Enums"]["contract_version_status"]
          substituida_em?: string | null
          substituida_por?: string | null
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string | null
        }
        Update: {
          ativada_em?: string | null
          ativada_por?: string | null
          atualizado_por?: string | null
          contrato_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          numero?: number
          origem_snapshot?: Json
          status?: Database["public"]["Enums"]["contract_version_status"]
          substituida_em?: string | null
          substituida_por?: string | null
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string | null
        }
        Relationships: [
          { foreignKeyName: "contrato_versoes_ativada_por_fkey"; columns: ["ativada_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_versoes_atualizado_por_fkey"; columns: ["atualizado_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_versoes_contrato_id_fkey"; columns: ["contrato_id"]; isOneToOne: false; referencedRelation: "contratos"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_versoes_criado_por_fkey"; columns: ["criado_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
          { foreignKeyName: "contrato_versoes_substituida_por_fkey"; columns: ["substituida_por"]; isOneToOne: false; referencedRelation: "app_users"; referencedColumns: ["id"] },
        ]
      }
      crm_in_app_notifications: {
        Row: {
          created_at: string
          id: string
          lida_em: string | null
          payload: Json
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida_em?: string | null
          payload?: Json
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida_em?: string | null
          payload?: Json
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      d4sign_api_usage: {
        Row: {
          id: number
          endpoint: string
          method: string
          source: string | null
          http_status: number | null
          created_at: string
        }
        Insert: {
          id?: never
          endpoint: string
          method?: string
          source?: string | null
          http_status?: number | null
          created_at?: string
        }
        Update: {
          id?: never
          endpoint?: string
          method?: string
          source?: string | null
          http_status?: number | null
          created_at?: string
        }
        Relationships: []
      }
      d4sign_documents: {
        Row: {
          created_at: string
          created_at_d4sign: string | null
          d4sign_status: string | null
          details_fetched_at: string | null
          finalized_at: string | null
          folder_area: string | null
          folder_name: string | null
          folder_path: string | null
          folder_uuid: string | null
          id: string
          last_synced_at: string | null
          link_contrato: string | null
          mime_type: string | null
          name_document: string | null
          oportunidade_id: string | null
          pages: number | null
          safe_name: string | null
          safe_uuid: string
          sent_by_app_user_id: string | null
          signers: Json
          size_bytes: number | null
          status_comment: string | null
          status_name: string | null
          updated_at: string
          uuid_doc: string
          who_canceled: Json | null
        }
        Insert: {
          created_at?: string
          created_at_d4sign?: string | null
          d4sign_status?: string | null
          details_fetched_at?: string | null
          finalized_at?: string | null
          folder_area?: string | null
          folder_name?: string | null
          folder_path?: string | null
          folder_uuid?: string | null
          id?: string
          last_synced_at?: string | null
          link_contrato?: string | null
          mime_type?: string | null
          name_document?: string | null
          oportunidade_id?: string | null
          pages?: number | null
          safe_name?: string | null
          safe_uuid?: string
          sent_by_app_user_id?: string | null
          signers?: Json
          size_bytes?: number | null
          status_comment?: string | null
          status_name?: string | null
          updated_at?: string
          uuid_doc: string
          who_canceled?: Json | null
        }
        Update: {
          created_at?: string
          created_at_d4sign?: string | null
          d4sign_status?: string | null
          details_fetched_at?: string | null
          finalized_at?: string | null
          folder_area?: string | null
          folder_name?: string | null
          folder_path?: string | null
          folder_uuid?: string | null
          id?: string
          last_synced_at?: string | null
          link_contrato?: string | null
          mime_type?: string | null
          name_document?: string | null
          oportunidade_id?: string | null
          pages?: number | null
          safe_name?: string | null
          safe_uuid?: string
          sent_by_app_user_id?: string | null
          signers?: Json
          size_bytes?: number | null
          status_comment?: string | null
          status_name?: string | null
          updated_at?: string
          uuid_doc?: string
          who_canceled?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "d4sign_documents_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      d4sign_webhook_events: {
        Row: {
          attempt_count: number
          created_at: string
          document_uuid: string
          id: string
          last_error: string | null
          processed_at: string | null
          processing_status: string
          raw_payload: Json
          signer_email: string | null
          type_post: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          document_uuid: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          processing_status?: string
          raw_payload?: Json
          signer_email?: string | null
          type_post: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          document_uuid?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          processing_status?: string
          raw_payload?: Json
          signer_email?: string | null
          type_post?: string
        }
        Relationships: []
      }
      document_instances: {
        Row: {
          created_at: string
          created_by: string | null
          current_version: number
          data_json: Json
          id: string
          oportunidade_id: string
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          data_json?: Json
          id?: string
          oportunidade_id: string
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          data_json?: Json
          id?: string
          oportunidade_id?: string
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_instances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_fields: {
        Row: {
          created_at: string
          field_code: string
          field_type: string
          id: string
          is_required: boolean
          label: string
          metadata: Json
          section: string
          sort_order: number
          source: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_code: string
          field_type?: string
          id?: string
          is_required?: boolean
          label: string
          metadata?: Json
          section?: string
          sort_order?: number
          source?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_code?: string
          field_type?: string
          id?: string
          is_required?: boolean
          label?: string
          metadata?: Json
          section?: string
          sort_order?: number
          source?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          created_at: string
          document_type: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          template_path: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          document_type?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          template_path?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          template_path?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          data_snapshot: Json
          generated_at: string
          generated_by: string | null
          generated_file_path: string | null
          id: string
          instance_id: string
          version_number: number
        }
        Insert: {
          data_snapshot?: Json
          generated_at?: string
          generated_by?: string | null
          generated_file_path?: string | null
          id?: string
          instance_id: string
          version_number: number
        }
        Update: {
          data_snapshot?: Json
          generated_at?: string
          generated_by?: string | null
          generated_file_path?: string | null
          id?: string
          instance_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      due_area_review_tasks: {
        Row: {
          adjustment_completed_at: string | null
          adjustment_completed_by_app_user_id: string | null
          adjustment_completion_note: string | null
          adjustment_evidence_kind: string | null
          adjustment_evidence_value: string | null
          adjustments_requested_at: string | null
          approved_at: string | null
          area_key: string
          compilation_elapsed_ms: number | null
          compilation_returned_at: string | null
          created_at: string
          email_enviado_em: string | null
          id: string
          notificado_em: string | null
          observacao_ajustes: string | null
          oportunidade_id: string
          prazo_ate: string | null
          responded_at: string | null
          responded_by_app_user_id: string | null
          responsavel_app_user_id: string | null
          review_elapsed_ms: number | null
          review_started_at: string | null
          revisao_reentry_at: string | null
          revision_cycle: number
          status: string
          ultimo_erro_canais: string | null
          updated_at: string
          whatsapp_enviado_em: string | null
        }
        Insert: {
          adjustment_completed_at?: string | null
          adjustment_completed_by_app_user_id?: string | null
          adjustment_completion_note?: string | null
          adjustment_evidence_kind?: string | null
          adjustment_evidence_value?: string | null
          adjustments_requested_at?: string | null
          approved_at?: string | null
          area_key: string
          compilation_elapsed_ms?: number | null
          compilation_returned_at?: string | null
          created_at?: string
          email_enviado_em?: string | null
          id?: string
          notificado_em?: string | null
          observacao_ajustes?: string | null
          oportunidade_id: string
          prazo_ate?: string | null
          responded_at?: string | null
          responded_by_app_user_id?: string | null
          responsavel_app_user_id?: string | null
          review_elapsed_ms?: number | null
          review_started_at?: string | null
          revisao_reentry_at?: string | null
          revision_cycle: number
          status?: string
          ultimo_erro_canais?: string | null
          updated_at?: string
          whatsapp_enviado_em?: string | null
        }
        Update: {
          adjustment_completed_at?: string | null
          adjustment_completed_by_app_user_id?: string | null
          adjustment_completion_note?: string | null
          adjustment_evidence_kind?: string | null
          adjustment_evidence_value?: string | null
          adjustments_requested_at?: string | null
          approved_at?: string | null
          area_key?: string
          compilation_elapsed_ms?: number | null
          compilation_returned_at?: string | null
          created_at?: string
          email_enviado_em?: string | null
          id?: string
          notificado_em?: string | null
          observacao_ajustes?: string | null
          oportunidade_id?: string
          prazo_ate?: string | null
          responded_at?: string | null
          responded_by_app_user_id?: string | null
          responsavel_app_user_id?: string | null
          review_elapsed_ms?: number | null
          review_started_at?: string | null
          revisao_reentry_at?: string | null
          revision_cycle?: number
          status?: string
          ultimo_erro_canais?: string | null
          updated_at?: string
          whatsapp_enviado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "due_area_review_tasks_adjustment_completed_by_app_user_id_fkey"
            columns: ["adjustment_completed_by_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_area_review_tasks_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_area_review_tasks_responded_by_app_user_id_fkey"
            columns: ["responded_by_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_area_review_tasks_responsavel_app_user_id_fkey"
            columns: ["responsavel_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      due_area_tasks: {
        Row: {
          area_key: string
          checklist_json: Json
          created_at: string
          dados_disponibilizados_em: string | null
          email_enviado_em: string | null
          id: string
          iniciado_em: string | null
          notificado_em: string | null
          observacao_sem_processos: string | null
          oportunidade_id: string
          pasta_due_confirmada: boolean
          prazo_ate: string | null
          responsavel_app_user_id: string | null
          sem_processos_ativos: boolean
          status: string
          ultimo_erro_canais: string | null
          updated_at: string
        }
        Insert: {
          area_key: string
          checklist_json?: Json
          created_at?: string
          dados_disponibilizados_em?: string | null
          email_enviado_em?: string | null
          id?: string
          iniciado_em?: string | null
          notificado_em?: string | null
          observacao_sem_processos?: string | null
          oportunidade_id: string
          pasta_due_confirmada?: boolean
          prazo_ate?: string | null
          responsavel_app_user_id?: string | null
          sem_processos_ativos?: boolean
          status?: string
          ultimo_erro_canais?: string | null
          updated_at?: string
        }
        Update: {
          area_key?: string
          checklist_json?: Json
          created_at?: string
          dados_disponibilizados_em?: string | null
          email_enviado_em?: string | null
          id?: string
          iniciado_em?: string | null
          notificado_em?: string | null
          observacao_sem_processos?: string | null
          oportunidade_id?: string
          pasta_due_confirmada?: boolean
          prazo_ate?: string | null
          responsavel_app_user_id?: string | null
          sem_processos_ativos?: boolean
          status?: string
          ultimo_erro_canais?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "due_area_tasks_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_area_tasks_responsavel_app_user_id_fkey"
            columns: ["responsavel_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      due_documents: {
        Row: {
          byte_size: number | null
          content_type: string | null
          document_kind: string
          id: string
          oportunidade_id: string
          original_filename: string
          storage_bucket: string
          storage_path: string
          uploaded_at: string
          uploaded_by_app_user_id: string | null
        }
        Insert: {
          byte_size?: number | null
          content_type?: string | null
          document_kind?: string
          id?: string
          oportunidade_id: string
          original_filename: string
          storage_bucket?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by_app_user_id?: string | null
        }
        Update: {
          byte_size?: number | null
          content_type?: string | null
          document_kind?: string
          id?: string
          oportunidade_id?: string
          original_filename?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by_app_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "due_documents_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_documents_uploaded_by_app_user_id_fkey"
            columns: ["uploaded_by_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definitions: {
        Row: {
          condition_json: Json | null
          created_at: string
          entity_name: string
          field_code: string
          field_options: Json | null
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          pipeline_code: string
          sort_order: number
          stage_code: string | null
        }
        Insert: {
          condition_json?: Json | null
          created_at?: string
          entity_name: string
          field_code: string
          field_options?: Json | null
          field_type: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          pipeline_code?: string
          sort_order?: number
          stage_code?: string | null
        }
        Update: {
          condition_json?: Json | null
          created_at?: string
          entity_name?: string
          field_code?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          pipeline_code?: string
          sort_order?: number
          stage_code?: string | null
        }
        Relationships: []
      }
      field_values: {
        Row: {
          entity_name: string
          entity_record_id: string
          field_definition_id: string
          id: string
          updated_at: string
          updated_by: string | null
          value_json: Json
        }
        Insert: {
          entity_name: string
          entity_record_id: string
          field_definition_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          value_json: Json
        }
        Update: {
          entity_name?: string
          entity_record_id?: string
          field_definition_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          error_count: number
          finished_at: string | null
          id: string
          processed_count: number
          source: string
          started_at: string | null
          status: string
          success_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          finished_at?: string | null
          id?: string
          processed_count?: number
          source: string
          started_at?: string | null
          status?: string
          success_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          finished_at?: string | null
          id?: string
          processed_count?: number
          source?: string
          started_at?: string | null
          status?: string
          success_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      indicadores: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          criado_em: string
          id: string
          nome: string
          status: Database["public"]["Enums"]["indicator_status"]
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          criado_em?: string
          id?: string
          nome: string
          status?: Database["public"]["Enums"]["indicator_status"]
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          criado_em?: string
          id?: string
          nome?: string
          status?: Database["public"]["Enums"]["indicator_status"]
        }
        Relationships: [
          {
            foreignKeyName: "indicadores_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_email_microsoft_oauth: {
        Row: {
          id: string
          refresh_token: string
          updated_at: string
          user_email: string | null
        }
        Insert: {
          id?: string
          refresh_token: string
          updated_at?: string
          user_email?: string | null
        }
        Update: {
          id?: string
          refresh_token?: string
          updated_at?: string
          user_email?: string | null
        }
        Relationships: []
      }
      lead_email_notification_config: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
          recipients: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
          recipients?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
          recipients?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      lead_email_notification_template: {
        Row: {
          created_at: string
          html_template: string
          subject_template: string
          updated_at: string
          variant: string
        }
        Insert: {
          created_at?: string
          html_template: string
          subject_template: string
          updated_at?: string
          variant: string
        }
        Update: {
          created_at?: string
          html_template?: string
          subject_template?: string
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      lead_intakes: {
        Row: {
          areas_analise: string[]
          cadastrado_por_email: string
          contexto_comercial: string | null
          created_at: string
          data_entrega_due: string | null
          data_reuniao: string | null
          due_diligence: boolean
          empresas_json: Json
          horario_entrega_due: string | null
          horario_reuniao: string | null
          id: string
          local_reuniao: string
          nome_indicacao: string | null
          oportunidade_id: string
          sharepoint_agendamento_created_at: string | null
          sharepoint_agendamento_error: string | null
          sharepoint_agendamento_id: string | null
          sharepoint_agendamento_url: string | null
          solicitante_nome: string | null
          tipo_indicacao: string | null
          tipo_lead: string
        }
        Insert: {
          areas_analise?: string[]
          cadastrado_por_email: string
          contexto_comercial?: string | null
          created_at?: string
          data_entrega_due?: string | null
          data_reuniao?: string | null
          due_diligence?: boolean
          empresas_json: Json
          horario_entrega_due?: string | null
          horario_reuniao?: string | null
          id?: string
          local_reuniao: string
          nome_indicacao?: string | null
          oportunidade_id: string
          sharepoint_agendamento_created_at?: string | null
          sharepoint_agendamento_error?: string | null
          sharepoint_agendamento_id?: string | null
          sharepoint_agendamento_url?: string | null
          solicitante_nome?: string | null
          tipo_indicacao?: string | null
          tipo_lead: string
        }
        Update: {
          areas_analise?: string[]
          cadastrado_por_email?: string
          contexto_comercial?: string | null
          created_at?: string
          data_entrega_due?: string | null
          data_reuniao?: string | null
          due_diligence?: boolean
          empresas_json?: Json
          horario_entrega_due?: string | null
          horario_reuniao?: string | null
          id?: string
          local_reuniao?: string
          nome_indicacao?: string | null
          oportunidade_id?: string
          sharepoint_agendamento_created_at?: string | null
          sharepoint_agendamento_error?: string | null
          sharepoint_agendamento_id?: string | null
          sharepoint_agendamento_url?: string | null
          solicitante_nome?: string | null
          tipo_indicacao?: string | null
          tipo_lead?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_intakes_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: true
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          body: string
          created_at: string
          created_by_app_user_id: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_pinned: boolean
          oportunidade_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by_app_user_id: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          oportunidade_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by_app_user_id?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          oportunidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_created_by_app_user_id_fkey"
            columns: ["created_by_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_note_mentions: {
        Row: {
          created_at: string
          id: string
          mentioned_app_user_id: string
          note_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentioned_app_user_id: string
          note_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentioned_app_user_id?: string
          note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_note_mentions_mentioned_app_user_id_fkey"
            columns: ["mentioned_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_note_mentions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "lead_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity_events: {
        Row: {
          actor_app_user_id: string | null
          area_key: string | null
          created_at: string
          detail: string | null
          etapa: Database["public"]["Enums"]["opportunity_stage"] | null
          id: string
          kind: string
          metadata: Json
          oportunidade_id: string
          source_id: string | null
          title: string
        }
        Insert: {
          actor_app_user_id?: string | null
          area_key?: string | null
          created_at?: string
          detail?: string | null
          etapa?: Database["public"]["Enums"]["opportunity_stage"] | null
          id?: string
          kind: string
          metadata?: Json
          oportunidade_id: string
          source_id?: string | null
          title: string
        }
        Update: {
          actor_app_user_id?: string | null
          area_key?: string | null
          created_at?: string
          detail?: string | null
          etapa?: Database["public"]["Enums"]["opportunity_stage"] | null
          id?: string
          kind?: string
          metadata?: Json
          oportunidade_id?: string
          source_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_events_actor_app_user_id_fkey"
            columns: ["actor_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_events_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidade_etapa_periodos: {
        Row: {
          created_at: string
          entered_at: string
          etapa: Database["public"]["Enums"]["opportunity_stage"]
          exited_at: string | null
          id: string
          oportunidade_id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          entered_at: string
          etapa: Database["public"]["Enums"]["opportunity_stage"]
          exited_at?: string | null
          id?: string
          oportunidade_id: string
          source?: string | null
        }
        Update: {
          created_at?: string
          entered_at?: string
          etapa?: Database["public"]["Enums"]["opportunity_stage"]
          exited_at?: string | null
          id?: string
          oportunidade_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_etapa_periodos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          cliente_id: string | null
          contrato_base_id: string | null
          created_at: string
          criado_por: string | null
          crm_rd_field_overrides: Json
          d4sign_document_uuid: string | null
          d4sign_signers: Json
          d4sign_status: string | null
          d4sign_updated_at: string | null
          due_compilacao_entrada_em: string | null
          due_revisao_entrada_em: string | null
          due_revision_cycle: number
          encerramento: string | null
          etapa: Database["public"]["Enums"]["opportunity_stage"]
          havera_due_diligence: boolean
          id: string
          indicador_nome_digitado: string | null
          link_contrato: string | null
          link_proposta: string | null
          solicitante_email: string | null
          solicitante_nome: string
          tipo: Database["public"]["Enums"]["demand_type"]
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          contrato_base_id?: string | null
          created_at?: string
          criado_por?: string | null
          crm_rd_field_overrides?: Json
          d4sign_document_uuid?: string | null
          d4sign_signers?: Json
          d4sign_status?: string | null
          d4sign_updated_at?: string | null
          due_compilacao_entrada_em?: string | null
          due_revisao_entrada_em?: string | null
          due_revision_cycle?: number
          encerramento?: string | null
          etapa?: Database["public"]["Enums"]["opportunity_stage"]
          havera_due_diligence?: boolean
          id?: string
          indicador_nome_digitado?: string | null
          link_contrato?: string | null
          link_proposta?: string | null
          solicitante_email?: string | null
          solicitante_nome: string
          tipo: Database["public"]["Enums"]["demand_type"]
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          contrato_base_id?: string | null
          created_at?: string
          criado_por?: string | null
          crm_rd_field_overrides?: Json
          d4sign_document_uuid?: string | null
          d4sign_signers?: Json
          d4sign_status?: string | null
          d4sign_updated_at?: string | null
          due_compilacao_entrada_em?: string | null
          due_revisao_entrada_em?: string | null
          due_revision_cycle?: number
          encerramento?: string | null
          etapa?: Database["public"]["Enums"]["opportunity_stage"]
          havera_due_diligence?: boolean
          id?: string
          indicador_nome_digitado?: string | null
          link_contrato?: string | null
          link_proposta?: string | null
          solicitante_email?: string | null
          solicitante_nome?: string
          tipo?: Database["public"]["Enums"]["demand_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_contrato_base_id_fkey"
            columns: ["contrato_base_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      proposal_investment_subtypes: {
        Row: {
          conceito: string
          created_at: string
          id: string
          investment_type_id: string
          is_active: boolean
          label: string
          placeholder_keys: string[]
          sort_order: number
          subtype_key: string
          template: string
          updated_at: string
        }
        Insert: {
          conceito?: string
          created_at?: string
          id?: string
          investment_type_id: string
          is_active?: boolean
          label: string
          placeholder_keys?: string[]
          sort_order?: number
          subtype_key: string
          template?: string
          updated_at?: string
        }
        Update: {
          conceito?: string
          created_at?: string
          id?: string
          investment_type_id?: string
          is_active?: boolean
          label?: string
          placeholder_keys?: string[]
          sort_order?: number
          subtype_key?: string
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_investment_subtypes_investment_type_id_fkey"
            columns: ["investment_type_id"]
            isOneToOne: false
            referencedRelation: "proposal_investment_types"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_investment_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          type_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          type_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          type_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposal_scope_subtypes: {
        Row: {
          created_at: string
          escopo_template: string
          id: string
          investimento_template: string
          is_active: boolean
          label: string
          placeholder_keys: string[]
          scope_type_id: string
          sort_order: number
          subtype_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          escopo_template?: string
          id?: string
          investimento_template?: string
          is_active?: boolean
          label: string
          placeholder_keys?: string[]
          scope_type_id: string
          sort_order?: number
          subtype_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          escopo_template?: string
          id?: string
          investimento_template?: string
          is_active?: boolean
          label?: string
          placeholder_keys?: string[]
          scope_type_id?: string
          sort_order?: number
          subtype_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_scope_subtypes_scope_type_id_fkey"
            columns: ["scope_type_id"]
            isOneToOne: false
            referencedRelation: "proposal_scope_types"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_scope_types: {
        Row: {
          area_key: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          type_key: string
          updated_at: string
        }
        Insert: {
          area_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          type_key: string
          updated_at?: string
        }
        Update: {
          area_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          type_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposta_escopo_solicitacao: {
        Row: {
          area_key: string
          concluido_em: string | null
          created_at: string
          email_enviado_em: string | null
          gestor_app_user_id: string | null
          id: string
          notificado_em: string | null
          oportunidade_id: string
          prazo_ate: string | null
          preenchido_por_app_user_id: string | null
          ultimo_erro_canais: string | null
          updated_at: string
          whatsapp_enviado_em: string | null
        }
        Insert: {
          area_key: string
          concluido_em?: string | null
          created_at?: string
          email_enviado_em?: string | null
          gestor_app_user_id?: string | null
          id?: string
          notificado_em?: string | null
          oportunidade_id: string
          prazo_ate?: string | null
          preenchido_por_app_user_id?: string | null
          ultimo_erro_canais?: string | null
          updated_at?: string
          whatsapp_enviado_em?: string | null
        }
        Update: {
          area_key?: string
          concluido_em?: string | null
          created_at?: string
          email_enviado_em?: string | null
          gestor_app_user_id?: string | null
          id?: string
          notificado_em?: string | null
          oportunidade_id?: string
          prazo_ate?: string | null
          preenchido_por_app_user_id?: string | null
          ultimo_erro_canais?: string | null
          updated_at?: string
          whatsapp_enviado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposta_escopo_solicitacao_gestor_app_user_id_fkey"
            columns: ["gestor_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_escopo_solicitacao_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_escopo_solicitacao_preenchido_por_app_user_id_fkey"
            columns: ["preenchido_por_app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_deal_reconciliacao: {
        Row: {
          detalhes: Json | null
          id: string
          import_batch_id: string | null
          oportunidade_id: string | null
          rd_deal_id: string
          reconciled_at: string
          status: string
        }
        Insert: {
          detalhes?: Json | null
          id?: string
          import_batch_id?: string | null
          oportunidade_id?: string | null
          rd_deal_id: string
          reconciled_at?: string
          status?: string
        }
        Update: {
          detalhes?: Json | null
          id?: string
          import_batch_id?: string | null
          oportunidade_id?: string | null
          rd_deal_id?: string
          reconciled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_deal_reconciliacao_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rd_deal_reconciliacao_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          code: Database["public"]["Enums"]["opportunity_stage"]
          created_at: string
          id: string
          is_active: boolean
          name: string
          pipeline_id: string
          sort_order: number
        }
        Insert: {
          code: Database["public"]["Enums"]["opportunity_stage"]
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pipeline_id: string
          sort_order: number
        }
        Update: {
          code?: Database["public"]["Enums"]["opportunity_stage"]
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pipeline_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      transicoes_etapa: {
        Row: {
          alterado_por: string | null
          criado_em: string
          etapa_destino: Database["public"]["Enums"]["opportunity_stage"]
          etapa_origem: Database["public"]["Enums"]["opportunity_stage"]
          id: string
          observacao: string | null
          oportunidade_id: string
        }
        Insert: {
          alterado_por?: string | null
          criado_em?: string
          etapa_destino: Database["public"]["Enums"]["opportunity_stage"]
          etapa_origem: Database["public"]["Enums"]["opportunity_stage"]
          id?: string
          observacao?: string | null
          oportunidade_id: string
        }
        Update: {
          alterado_por?: string | null
          criado_em?: string
          etapa_destino?: Database["public"]["Enums"]["opportunity_stage"]
          etapa_origem?: Database["public"]["Enums"]["opportunity_stage"]
          id?: string
          observacao?: string | null
          oportunidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transicoes_etapa_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transicoes_etapa_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_due_config: {
        Row: {
          created_at: string
          destination: string
          destination_type: string
          id: string
          is_active: boolean
          label: string
          notes: string | null
          updated_at: string
          use_case: string
        }
        Insert: {
          created_at?: string
          destination: string
          destination_type: string
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          updated_at?: string
          use_case?: string
        }
        Update: {
          created_at?: string
          destination?: string
          destination_type?: string
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
          use_case?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_field_definitions_duplicate_labels: {
        Row: {
          definition_ids: string[] | null
          field_codes: string[] | null
          label_norm: string | null
          pipeline_code: string | null
          row_count: number | null
          stage_code: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_contract_version_atomic: {
        Args: {
          p_actor_id: string
          p_advance_opportunity: boolean
          p_contract_id: string
          p_expected_version_updated_at: string
          p_now: string
          p_version_id: string
        }
        Returns: {
          contract_id: string
          opportunity_id: string | null
          opportunity_transition_id: string | null
          version_id: string
        }[]
      }
      admin_change_user_role: {
        Args: {
          p_actor: string
          p_next_role: string
          p_target: string
        }
        Returns: boolean
      }
      admin_delete_user: {
        Args: {
          p_actor: string
          p_target: string
        }
        Returns: string
      }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      delete_crm_lead_atomic: {
        Args: { p_opportunity_id: string }
        Returns: boolean
      }
      finalize_d4sign_opportunity: {
        Args: {
          p_now: string
          p_opportunity_id: string
          p_signers: Json
        }
        Returns: string | null
      }
      get_contract_billing_transition_state: {
        Args: {
          p_on_date: string
          p_opportunity_id: string
        }
        Returns: {
          code: string | null
          contract_id: string | null
          is_valid: boolean
          reason: string | null
        }[]
      }
      ensure_contract_draft_for_opportunity: {
        Args: {
          p_now: string
          p_opportunity_id: string
        }
        Returns: string
      }
      save_contract_configuration_atomic: {
        Args: {
          p_actor_id: string
          p_configuration: Json
          p_contract: Json
          p_contract_id: string
          p_expected_version_updated_at: string
          p_now: string
          p_version_id: string
        }
        Returns: string
      }
      create_contract_closing_revision: {
        Args: {
          p_actor_id: string
          p_competencia: string
          p_contract_id: string
          p_expected_revision: number
          p_items: Json
          p_totals: Json
          p_version_id: string
        }
        Returns: { closing_id: string; revision_id: string; revision_number: number }[]
      }
      approve_contract_closing_revision: {
        Args: { p_actor_id: string; p_closing_id: string; p_contract_id: string; p_expected_revision: number }
        Returns: Database["public"]["Tables"]["contrato_fechamento_revisoes"]["Row"]
      }
      create_contract_closing_correction: {
        Args: {
          p_actor_id: string
          p_closing_id: string
          p_contract_id: string
          p_expected_revision: number
          p_previous_revision_id: string
          p_reason: string
        }
        Returns: Database["public"]["Tables"]["contrato_fechamento_revisoes"]["Row"]
      }
      register_contract_closing_vios: {
        Args: {
          p_actor_id: string
          p_closing_id: string
          p_contract_id: string
          p_expected_revision: number
          p_reference: string
          p_url: string
        }
        Returns: Database["public"]["Tables"]["contrato_fechamento_revisoes"]["Row"]
      }
      resolve_contract_closing_blocker: {
        Args: { p_actor_id: string; p_closing_id: string; p_contract_id: string; p_expected_revision: number; p_item_id: string; p_reason: string; p_resolution: string }
        Returns: Database["public"]["Tables"]["contrato_fechamento_itens"]["Row"]
      }
      upsert_contract_consumptions_atomic: {
        Args: { p_actor_id: string; p_competencia: string; p_contract_id: string; p_items: Json; p_version_id: string }
        Returns: Database["public"]["Tables"]["contrato_consumos_mensais"]["Row"][]
      }
      registrar_lancamento_vios_fechamento: {
        Args: {
          p_lancado_em?: string
          p_lancado_por: string
          p_revisao_id: string
          p_vios_referencia: string
          p_vios_url: string
        }
        Returns: Database["public"]["Tables"]["contrato_fechamento_revisoes"]["Row"]
      }
      transition_opportunity_atomic: {
        Args: {
          p_changed_by: string
          p_due_compilacao_entrada_em: string | null
          p_due_revisao_entrada_em: string | null
          p_due_revision_cycle: number | null
          p_expected_stage: Database["public"]["Enums"]["opportunity_stage"]
          p_field_values: Json
          p_lead_intake: Json
          p_link_contrato: string | null
          p_link_proposta: string | null
          p_next_stage: Database["public"]["Enums"]["opportunity_stage"]
          p_opportunity_id: string
          p_set_link_contrato: boolean
          p_set_link_proposta: boolean
          p_updated_at: string
        }
        Returns: {
          link_contrato: string | null
          link_proposta: string | null
          transition_id: string
        }[]
      }
    }
    Enums: {
      contract_closing_status:
        | "a_calcular"
        | "em_revisao"
        | "aprovado"
        | "lancado_vios"
        | "cancelado"
      contract_lifecycle_status:
        | "rascunho"
        | "em_revisao"
        | "ativo"
        | "suspenso"
        | "encerrado"
      contract_status: "rascunho" | "enviado" | "assinado"
      contract_version_status: "rascunho" | "ativa" | "substituida" | "cancelada"
      demand_type: "novo_lead" | "novo_contrato" | "aditivo"
      indicator_status: "pendente_aprovacao" | "aprovado" | "mesclado"
      opportunity_stage:
        | "cadastro_lead"
        | "levantamento_dados"
        | "compilacao"
        | "revisao"
        | "due_diligence_finalizada"
        | "reuniao"
        | "confeccao_proposta"
        | "proposta_enviada"
        | "confeccao_contrato"
        | "contrato_elaborado"
        | "contrato_enviado"
        | "contrato_assinado"
        | "aguardando_cadastro"
        | "cadastro_novo_cliente"
        | "inclusao_faturamento"
        | "boas_vindas"
        | "reuniao_kickoff"
      user_role: "admin" | "comercial" | "controladoria" | "financeiro"
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
      contract_closing_status: [
        "a_calcular",
        "em_revisao",
        "aprovado",
        "lancado_vios",
        "cancelado",
      ],
      contract_lifecycle_status: [
        "rascunho",
        "em_revisao",
        "ativo",
        "suspenso",
        "encerrado",
      ],
      contract_status: ["rascunho", "enviado", "assinado"],
      contract_version_status: ["rascunho", "ativa", "substituida", "cancelada"],
      demand_type: ["novo_lead", "novo_contrato", "aditivo"],
      indicator_status: ["pendente_aprovacao", "aprovado", "mesclado"],
      opportunity_stage: [
        "cadastro_lead",
        "levantamento_dados",
        "compilacao",
        "revisao",
        "due_diligence_finalizada",
        "reuniao",
        "confeccao_proposta",
        "proposta_enviada",
        "confeccao_contrato",
        "contrato_elaborado",
        "contrato_enviado",
        "contrato_assinado",
        "aguardando_cadastro",
        "cadastro_novo_cliente",
        "inclusao_faturamento",
        "boas_vindas",
        "reuniao_kickoff",
      ],
      user_role: ["admin", "comercial", "controladoria", "financeiro"],
    },
  },
} as const
