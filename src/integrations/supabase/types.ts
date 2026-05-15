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
      alert_configs: {
        Row: {
          channels: Database["public"]["Enums"]["notification_channel"][]
          digest_dow: number
          digest_hour: number
          frequency: Database["public"]["Enums"]["notification_frequency"]
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: Database["public"]["Enums"]["notification_channel"][]
          digest_dow?: number
          digest_hour?: number
          frequency?: Database["public"]["Enums"]["notification_frequency"]
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: Database["public"]["Enums"]["notification_channel"][]
          digest_dow?: number
          digest_hour?: number
          frequency?: Database["public"]["Enums"]["notification_frequency"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      circuit_breakers: {
        Row: {
          adapter: string
          failure_count: number
          failure_window_started_at: string | null
          half_open_probe_at: string | null
          last_error: string | null
          last_outcome: string | null
          opened_at: string | null
          state: Database["public"]["Enums"]["circuit_breaker_state"]
          updated_at: string
        }
        Insert: {
          adapter: string
          failure_count?: number
          failure_window_started_at?: string | null
          half_open_probe_at?: string | null
          last_error?: string | null
          last_outcome?: string | null
          opened_at?: string | null
          state?: Database["public"]["Enums"]["circuit_breaker_state"]
          updated_at?: string
        }
        Update: {
          adapter?: string
          failure_count?: number
          failure_window_started_at?: string | null
          half_open_probe_at?: string | null
          last_error?: string | null
          last_outcome?: string | null
          opened_at?: string | null
          state?: Database["public"]["Enums"]["circuit_breaker_state"]
          updated_at?: string
        }
        Relationships: []
      }
      datajud_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          payload: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          payload: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          payload?: Json
        }
        Relationships: []
      }
      discovery_runs: {
        Row: {
          by_oab: Json
          by_tribunal: Json
          errors: Json | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          target_id: string
          total_found: number
          triggered_by: string
          user_id: string
        }
        Insert: {
          by_oab?: Json
          by_tribunal?: Json
          errors?: Json | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          target_id: string
          total_found?: number
          triggered_by: string
          user_id: string
        }
        Update: {
          by_oab?: Json
          by_tribunal?: Json
          errors?: Json | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          target_id?: string
          total_found?: number
          triggered_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_runs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "monitoring_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          attempts: number
          correlation_id: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          last_error_kind: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          priority: number
          process_number: string
          scheduled_for: string
          status: Database["public"]["Enums"]["ingestion_job_status"]
          target_ids: string[]
          tribunal: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          correlation_id?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_error_kind?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          process_number: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["ingestion_job_status"]
          target_ids?: string[]
          tribunal: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          correlation_id?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_error_kind?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          process_number?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["ingestion_job_status"]
          target_ids?: string[]
          tribunal?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_targets: {
        Row: {
          against_state_only: boolean | null
          aliases: string[] | null
          auto_discovered: boolean
          class_codes: string[] | null
          cpf_enc: string | null
          cpf_hash: string | null
          created_at: string
          discovery_status: string | null
          full_name: string | null
          id: string
          include_inactive: boolean
          is_active: boolean
          keywords: string[] | null
          last_discovery_at: string | null
          lawyer_name: string | null
          nickname: string | null
          oab: string | null
          oab_numbers: string[] | null
          process_number: string | null
          qualification: string | null
          source_type: string | null
          tribunal_alias: string | null
          tribunal_aliases: string[] | null
          tribunal_scope: string[]
          type: Database["public"]["Enums"]["target_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          against_state_only?: boolean | null
          aliases?: string[] | null
          auto_discovered?: boolean
          class_codes?: string[] | null
          cpf_enc?: string | null
          cpf_hash?: string | null
          created_at?: string
          discovery_status?: string | null
          full_name?: string | null
          id?: string
          include_inactive?: boolean
          is_active?: boolean
          keywords?: string[] | null
          last_discovery_at?: string | null
          lawyer_name?: string | null
          nickname?: string | null
          oab?: string | null
          oab_numbers?: string[] | null
          process_number?: string | null
          qualification?: string | null
          source_type?: string | null
          tribunal_alias?: string | null
          tribunal_aliases?: string[] | null
          tribunal_scope?: string[]
          type: Database["public"]["Enums"]["target_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          against_state_only?: boolean | null
          aliases?: string[] | null
          auto_discovered?: boolean
          class_codes?: string[] | null
          cpf_enc?: string | null
          cpf_hash?: string | null
          created_at?: string
          discovery_status?: string | null
          full_name?: string | null
          id?: string
          include_inactive?: boolean
          is_active?: boolean
          keywords?: string[] | null
          last_discovery_at?: string | null
          lawyer_name?: string | null
          nickname?: string | null
          oab?: string | null
          oab_numbers?: string[] | null
          process_number?: string | null
          qualification?: string | null
          source_type?: string | null
          tribunal_alias?: string | null
          tribunal_aliases?: string[] | null
          tribunal_scope?: string[]
          type?: Database["public"]["Enums"]["target_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_targets_tribunal_alias_fkey"
            columns: ["tribunal_alias"]
            isOneToOne: false
            referencedRelation: "tribunals"
            referencedColumns: ["alias"]
          },
        ]
      }
      movements: {
        Row: {
          classification_reasons: Json | null
          cnj_movement_id: string
          code: number | null
          created_at: string
          id: string
          match_excerpt: string | null
          occurred_at: string
          process_id: string
          text: string | null
          urgency: Database["public"]["Enums"]["movement_urgency"]
        }
        Insert: {
          classification_reasons?: Json | null
          cnj_movement_id: string
          code?: number | null
          created_at?: string
          id?: string
          match_excerpt?: string | null
          occurred_at: string
          process_id: string
          text?: string | null
          urgency?: Database["public"]["Enums"]["movement_urgency"]
        }
        Update: {
          classification_reasons?: Json | null
          cnj_movement_id?: string
          code?: number | null
          created_at?: string
          id?: string
          match_excerpt?: string | null
          occurred_at?: string
          process_id?: string
          text?: string | null
          urgency?: Database["public"]["Enums"]["movement_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "movements_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          last_error: string | null
          masked_recipient: string | null
          movement_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          masked_recipient?: string | null
          movement_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          masked_recipient?: string | null
          movement_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          cnpj: string | null
          cpf_hash: string | null
          id: string
          is_state: boolean
          name_normalized: string
          polo: Database["public"]["Enums"]["party_polo"]
          process_id: string
          qualification: string | null
        }
        Insert: {
          cnpj?: string | null
          cpf_hash?: string | null
          id?: string
          is_state?: boolean
          name_normalized: string
          polo: Database["public"]["Enums"]["party_polo"]
          process_id: string
          qualification?: string | null
        }
        Update: {
          cnpj?: string | null
          cpf_hash?: string | null
          id?: string
          is_state?: boolean
          name_normalized?: string
          polo?: Database["public"]["Enums"]["party_polo"]
          process_id?: string
          qualification?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      process_movements: {
        Row: {
          complements: Json | null
          created_at: string
          id: string
          is_new: boolean | null
          movement_code: number | null
          movement_name: string
          notified_at: string | null
          occurred_at: string
          organ_code: string | null
          organ_name: string | null
          process_id: string
          raw_data: Json | null
        }
        Insert: {
          complements?: Json | null
          created_at?: string
          id?: string
          is_new?: boolean | null
          movement_code?: number | null
          movement_name: string
          notified_at?: string | null
          occurred_at: string
          organ_code?: string | null
          organ_name?: string | null
          process_id: string
          raw_data?: Json | null
        }
        Update: {
          complements?: Json | null
          created_at?: string
          id?: string
          is_new?: boolean | null
          movement_code?: number | null
          movement_name?: string
          notified_at?: string | null
          occurred_at?: string
          organ_code?: string | null
          organ_name?: string | null
          process_id?: string
          raw_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "process_movements_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      process_updates: {
        Row: {
          canonical: Json
          created_at: string
          id: string
          is_initial_discovery: boolean
          movements_diff: Json
          movements_hash: string
          process_id: string | null
          process_number: string
          source: Database["public"]["Enums"]["ingestion_source"]
          target_id: string | null
          tribunal: string
        }
        Insert: {
          canonical: Json
          created_at?: string
          id?: string
          is_initial_discovery?: boolean
          movements_diff?: Json
          movements_hash: string
          process_id?: string | null
          process_number: string
          source: Database["public"]["Enums"]["ingestion_source"]
          target_id?: string | null
          tribunal: string
        }
        Update: {
          canonical?: Json
          created_at?: string
          id?: string
          is_initial_discovery?: boolean
          movements_diff?: Json
          movements_hash?: string
          process_id?: string | null
          process_number?: string
          source?: Database["public"]["Enums"]["ingestion_source"]
          target_id?: string | null
          tribunal?: string
        }
        Relationships: []
      }
      processes: {
        Row: {
          class_code: number | null
          class_name: string | null
          created_at: string
          filed_at: string | null
          format_name: string | null
          id: string
          instance: number | null
          last_known_movements_hash: string | null
          last_movement_at: string | null
          last_source_used:
            | Database["public"]["Enums"]["ingestion_source"]
            | null
          last_synced_at: string | null
          last_update_at: string | null
          municipality_ibge: number | null
          new_movements_count: number | null
          organ_code: string | null
          organ_name: string | null
          parties_json: Json | null
          process_number: string
          secrecy_level: number | null
          subject_codes: number[] | null
          subject_names: string[] | null
          sync_status: string | null
          system_name: string | null
          total_movements: number | null
          tribunal_alias: string
        }
        Insert: {
          class_code?: number | null
          class_name?: string | null
          created_at?: string
          filed_at?: string | null
          format_name?: string | null
          id?: string
          instance?: number | null
          last_known_movements_hash?: string | null
          last_movement_at?: string | null
          last_source_used?:
            | Database["public"]["Enums"]["ingestion_source"]
            | null
          last_synced_at?: string | null
          last_update_at?: string | null
          municipality_ibge?: number | null
          new_movements_count?: number | null
          organ_code?: string | null
          organ_name?: string | null
          parties_json?: Json | null
          process_number: string
          secrecy_level?: number | null
          subject_codes?: number[] | null
          subject_names?: string[] | null
          sync_status?: string | null
          system_name?: string | null
          total_movements?: number | null
          tribunal_alias: string
        }
        Update: {
          class_code?: number | null
          class_name?: string | null
          created_at?: string
          filed_at?: string | null
          format_name?: string | null
          id?: string
          instance?: number | null
          last_known_movements_hash?: string | null
          last_movement_at?: string | null
          last_source_used?:
            | Database["public"]["Enums"]["ingestion_source"]
            | null
          last_synced_at?: string | null
          last_update_at?: string | null
          municipality_ibge?: number | null
          new_movements_count?: number | null
          organ_code?: string | null
          organ_name?: string | null
          parties_json?: Json | null
          process_number?: string
          secrecy_level?: number | null
          subject_codes?: number[] | null
          subject_names?: string[] | null
          sync_status?: string | null
          system_name?: string | null
          total_movements?: number | null
          tribunal_alias?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_tribunal_alias_fkey"
            columns: ["tribunal_alias"]
            isOneToOne: false
            referencedRelation: "tribunals"
            referencedColumns: ["alias"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email_enc: string | null
          id: string
          name: string | null
          oab: string | null
          phone_enc: string | null
          tz: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email_enc?: string | null
          id: string
          name?: string | null
          oab?: string | null
          phone_enc?: string | null
          tz?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email_enc?: string | null
          id?: string
          name?: string | null
          oab?: string | null
          phone_enc?: string | null
          tz?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          capacity: number
          refill_per_sec: number
          tokens: number
          updated_at: string
        }
        Insert: {
          bucket_key: string
          capacity: number
          refill_per_sec: number
          tokens: number
          updated_at?: string
        }
        Update: {
          bucket_key?: string
          capacity?: number
          refill_per_sec?: number
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      raw_payloads: {
        Row: {
          correlation_id: string | null
          fetched_at: string
          http_status: number | null
          id: string
          latency_ms: number | null
          payload: Json
          process_number: string
          source: Database["public"]["Enums"]["ingestion_source"]
          tribunal: string
        }
        Insert: {
          correlation_id?: string | null
          fetched_at?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          payload: Json
          process_number: string
          source: Database["public"]["Enums"]["ingestion_source"]
          tribunal: string
        }
        Update: {
          correlation_id?: string | null
          fetched_at?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          payload?: Json
          process_number?: string
          source?: Database["public"]["Enums"]["ingestion_source"]
          tribunal?: string
        }
        Relationships: []
      }
      target_process_links: {
        Row: {
          first_linked_at: string
          matched_at: string
          matched_value: string | null
          matched_via: string | null
          process_id: string
          target_id: string
          unlinked_at: string | null
        }
        Insert: {
          first_linked_at?: string
          matched_at?: string
          matched_value?: string | null
          matched_via?: string | null
          process_id: string
          target_id: string
          unlinked_at?: string | null
        }
        Update: {
          first_linked_at?: string
          matched_at?: string
          matched_value?: string | null
          matched_via?: string | null
          process_id?: string
          target_id?: string
          unlinked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "target_process_links_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "target_process_links_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "monitoring_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      tribunal_credentials: {
        Row: {
          created_at: string
          id: string
          last_validated_at: string | null
          last_validation_error: string | null
          last_validation_status: string | null
          oab_number: string
          oab_uf: string
          password_enc: string
          tribunal_alias: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          oab_number: string
          oab_uf: string
          password_enc: string
          tribunal_alias: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          oab_number?: string
          oab_uf?: string
          password_enc?: string
          tribunal_alias?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tribunals: {
        Row: {
          alias: string
          created_at: string
          last_synced_at: string | null
          name: string
          sphere: Database["public"]["Enums"]["tribunal_sphere"]
          status: Database["public"]["Enums"]["tribunal_status"]
        }
        Insert: {
          alias: string
          created_at?: string
          last_synced_at?: string | null
          name: string
          sphere: Database["public"]["Enums"]["tribunal_sphere"]
          status?: Database["public"]["Enums"]["tribunal_status"]
        }
        Update: {
          alias?: string
          created_at?: string
          last_synced_at?: string | null
          name?: string
          sphere?: Database["public"]["Enums"]["tribunal_sphere"]
          status?: Database["public"]["Enums"]["tribunal_status"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_rate_limit: {
        Args: {
          _capacity: number
          _key: string
          _refill_per_sec: number
          _tokens?: number
        }
        Returns: boolean
      }
      get_tribunal_credential_for_scraper: {
        Args: { _key: string; _tribunal: string; _user_id: string }
        Returns: {
          oab_number: string
          oab_uf: string
          password: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pick_ingestion_jobs: {
        Args: {
          _limit?: number
          _lock_seconds?: number
          _statuses: Database["public"]["Enums"]["ingestion_job_status"][]
          _worker: string
        }
        Returns: {
          attempts: number
          correlation_id: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          last_error_kind: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          priority: number
          process_number: string
          scheduled_for: string
          status: Database["public"]["Enums"]["ingestion_job_status"]
          target_ids: string[]
          tribunal: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ingestion_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_tribunal_credential: {
        Args: {
          _key: string
          _oab_number: string
          _oab_uf: string
          _password: string
          _tribunal: string
        }
        Returns: string
      }
      update_credential_validation: {
        Args: { _credential_id: string; _error: string; _status: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "user"
      circuit_breaker_state: "closed" | "open" | "half_open"
      ingestion_job_status:
        | "queued"
        | "processing"
        | "needs_scraping"
        | "done"
        | "failed"
        | "dead_letter"
      ingestion_source: "datajud" | "tjsp_esaj" | "manual"
      movement_urgency: "critical" | "high" | "medium" | "info"
      notification_channel: "email" | "whatsapp"
      notification_frequency: "instant" | "daily" | "weekly"
      notification_status: "queued" | "sent" | "failed" | "dead_letter"
      party_polo: "ativo" | "passivo"
      target_type: "person" | "process" | "radar" | "lawyer"
      tribunal_sphere:
        | "estadual"
        | "federal"
        | "trabalho"
        | "eleitoral"
        | "militar"
        | "superior"
      tribunal_status: "active" | "delayed" | "offline"
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
      app_role: ["admin", "operator", "user"],
      circuit_breaker_state: ["closed", "open", "half_open"],
      ingestion_job_status: [
        "queued",
        "processing",
        "needs_scraping",
        "done",
        "failed",
        "dead_letter",
      ],
      ingestion_source: ["datajud", "tjsp_esaj", "manual"],
      movement_urgency: ["critical", "high", "medium", "info"],
      notification_channel: ["email", "whatsapp"],
      notification_frequency: ["instant", "daily", "weekly"],
      notification_status: ["queued", "sent", "failed", "dead_letter"],
      party_polo: ["ativo", "passivo"],
      target_type: ["person", "process", "radar", "lawyer"],
      tribunal_sphere: [
        "estadual",
        "federal",
        "trabalho",
        "eleitoral",
        "militar",
        "superior",
      ],
      tribunal_status: ["active", "delayed", "offline"],
    },
  },
} as const
