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
      monitoring_targets: {
        Row: {
          against_state_only: boolean | null
          aliases: string[] | null
          class_codes: number[] | null
          cpf_enc: string | null
          cpf_hash: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          keywords: string[] | null
          nickname: string | null
          oab: string | null
          process_number: string | null
          qualification: string | null
          tribunal_alias: string | null
          tribunal_aliases: string[] | null
          type: Database["public"]["Enums"]["target_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          against_state_only?: boolean | null
          aliases?: string[] | null
          class_codes?: number[] | null
          cpf_enc?: string | null
          cpf_hash?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          nickname?: string | null
          oab?: string | null
          process_number?: string | null
          qualification?: string | null
          tribunal_alias?: string | null
          tribunal_aliases?: string[] | null
          type: Database["public"]["Enums"]["target_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          against_state_only?: boolean | null
          aliases?: string[] | null
          class_codes?: number[] | null
          cpf_enc?: string | null
          cpf_hash?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          nickname?: string | null
          oab?: string | null
          process_number?: string | null
          qualification?: string | null
          tribunal_alias?: string | null
          tribunal_aliases?: string[] | null
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
      processes: {
        Row: {
          class_code: number | null
          created_at: string
          id: string
          last_known_movements_hash: string | null
          last_synced_at: string | null
          parties_json: Json | null
          process_number: string
          subject_codes: number[] | null
          tribunal_alias: string
        }
        Insert: {
          class_code?: number | null
          created_at?: string
          id?: string
          last_known_movements_hash?: string | null
          last_synced_at?: string | null
          parties_json?: Json | null
          process_number: string
          subject_codes?: number[] | null
          tribunal_alias: string
        }
        Update: {
          class_code?: number | null
          created_at?: string
          id?: string
          last_known_movements_hash?: string | null
          last_synced_at?: string | null
          parties_json?: Json | null
          process_number?: string
          subject_codes?: number[] | null
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
      target_process_links: {
        Row: {
          matched_at: string
          process_id: string
          target_id: string
        }
        Insert: {
          matched_at?: string
          process_id: string
          target_id: string
        }
        Update: {
          matched_at?: string
          process_id?: string
          target_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      movement_urgency: "critical" | "high" | "medium" | "info"
      notification_channel: "email" | "whatsapp"
      notification_frequency: "instant" | "daily" | "weekly"
      notification_status: "queued" | "sent" | "failed" | "dead_letter"
      party_polo: "ativo" | "passivo"
      target_type: "person" | "process" | "radar"
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
      movement_urgency: ["critical", "high", "medium", "info"],
      notification_channel: ["email", "whatsapp"],
      notification_frequency: ["instant", "daily", "weekly"],
      notification_status: ["queued", "sent", "failed", "dead_letter"],
      party_polo: ["ativo", "passivo"],
      target_type: ["person", "process", "radar"],
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
