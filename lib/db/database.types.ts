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
      call_events: {
        Row: {
          call_id: string
          confidence: number | null
          created_at: string
          event_state: string
          id: number
          occurred_at: string
          speaker: string | null
          tenant_id: string
          text: string | null
        }
        Insert: {
          call_id: string
          confidence?: number | null
          created_at?: string
          event_state: string
          id?: number
          occurred_at: string
          speaker?: string | null
          tenant_id: string
          text?: string | null
        }
        Update: {
          call_id?: string
          confidence?: number | null
          created_at?: string
          event_state?: string
          id?: number
          occurred_at?: string
          speaker?: string | null
          tenant_id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_user_id: string | null
          call_type: string | null
          dialpad_call_id: string
          ended_at: string | null
          goal: string | null
          id: string
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          agent_user_id?: string | null
          call_type?: string | null
          dialpad_call_id: string
          ended_at?: string | null
          goal?: string | null
          id?: string
          started_at: string
          status: string
          tenant_id: string
        }
        Update: {
          agent_user_id?: string | null
          call_type?: string | null
          dialpad_call_id?: string
          ended_at?: string | null
          goal?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          intent_tags: string[]
          source_document_id: string | null
          tenant_id: string
          title: string | null
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          intent_tags: string[]
          source_document_id?: string | null
          tenant_id: string
          title?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          intent_tags?: string[]
          source_document_id?: string | null
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          call_id: string
          content: string
          created_at: string
          id: string
          intent: string | null
          is_complete: boolean
          tenant_id: string
          triggered_by_event_id: number | null
          was_used: boolean | null
        }
        Insert: {
          call_id: string
          content?: string
          created_at?: string
          id?: string
          intent?: string | null
          is_complete?: boolean
          tenant_id: string
          triggered_by_event_id?: number | null
          was_used?: boolean | null
        }
        Update: {
          call_id?: string
          content?: string
          created_at?: string
          id?: string
          intent?: string | null
          is_complete?: boolean
          tenant_id?: string
          triggered_by_event_id?: number | null
          was_used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_triggered_by_event_id_fkey"
            columns: ["triggered_by_event_id"]
            isOneToOne: false
            referencedRelation: "call_events"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          connected_at: string | null
          dialpad_access_token_encrypted: string | null
          dialpad_company_id: string | null
          dialpad_refresh_token_encrypted: string | null
          dialpad_subscription_id: string | null
          dialpad_token_expires_at: string | null
          dialpad_user_email: string | null
          dialpad_user_id: string | null
          dialpad_websocket_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          dialpad_access_token_encrypted?: string | null
          dialpad_company_id?: string | null
          dialpad_refresh_token_encrypted?: string | null
          dialpad_subscription_id?: string | null
          dialpad_token_expires_at?: string | null
          dialpad_user_email?: string | null
          dialpad_user_id?: string | null
          dialpad_websocket_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          dialpad_access_token_encrypted?: string | null
          dialpad_company_id?: string | null
          dialpad_refresh_token_encrypted?: string | null
          dialpad_subscription_id?: string | null
          dialpad_token_expires_at?: string | null
          dialpad_user_email?: string | null
          dialpad_user_id?: string | null
          dialpad_websocket_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          day: string
          input_tokens: number
          output_tokens: number
          tenant_id: string
          total_usd: number
          updated_at: string
        }
        Insert: {
          day: string
          input_tokens?: number
          output_tokens?: number
          tenant_id: string
          total_usd?: number
          updated_at?: string
        }
        Update: {
          day?: string
          input_tokens?: number
          output_tokens?: number
          tenant_id?: string
          total_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          dialpad_account_id: string | null
          id: string
          monthly_cost_ceiling_usd: number
          name: string
          plan: string
        }
        Insert: {
          created_at?: string
          dialpad_account_id?: string | null
          id?: string
          monthly_cost_ceiling_usd?: number
          name: string
          plan?: string
        }
        Update: {
          created_at?: string
          dialpad_account_id?: string | null
          id?: string
          monthly_cost_ceiling_usd?: number
          name?: string
          plan?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_kb_chunks: {
        Args: {
          filter_intents: string[]
          filter_tenant_id: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
        }[]
      }
      add_tenant_usage: {
        Args: {
          p_tenant_id: string
          p_day: string
          p_input_tokens: number
          p_output_tokens: number
          p_cost: number
        }
        Returns: number
      }
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
