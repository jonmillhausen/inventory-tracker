export type UserRole = 'admin' | 'sales' | 'staff' | 'readonly'
export type BookingStatus = 'confirmed' | 'canceled' | 'completed' | 'needs_review'
export type EventType = 'coordinated' | 'dropoff' | 'pickup' | 'willcall' | 'arena_pickup'
export type BookingSource = 'webhook' | 'manual'
export type ItemType = 'equipment' | 'sub_item'
export type ResolvedAction = 'cleared' | 'moved_to_oos'
export type WebhookResult = 'success' | 'error' | 'unmapped_service' | 'skipped'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          full_name: string
          role: UserRole
          theme: 'light' | 'dark'
          created_at: string
        }
        Insert: {
          id: string
          full_name: string
          role: UserRole
          theme?: 'light' | 'dark'
        }
        Update: Partial<{ full_name: string; role: UserRole; theme: 'light' | 'dark' }>
        Relationships: []
      }
      equipment: {
        Row: {
          id: string
          name: string
          total_qty: number
          out_of_service: number
          issue_flag: number
          is_active: boolean
          custom_setup_min: number | null
          custom_cleanup_min: number | null
          categories: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          total_qty: number
          is_active?: boolean
          custom_setup_min?: number | null
          custom_cleanup_min?: number | null
          categories?: string[]
        }
        Update: Partial<{
          name: string
          total_qty: number
          is_active: boolean
          custom_setup_min: number | null
          custom_cleanup_min: number | null
          categories: string[]
        }>
        Relationships: []
      }
      equipment_sub_items: {
        Row: {
          id: string
          parent_id: string
          name: string
          total_qty: number
          out_of_service: number
          issue_flag: number
          is_active: boolean
        }
        Insert: {
          id: string
          parent_id: string
          name: string
          total_qty: number
          is_active?: boolean
        }
        Update: Partial<{ name: string; total_qty: number; is_active: boolean }>
        Relationships: []
      }
      equipment_sub_item_links: {
        Row: {
          id: string
          sub_item_id: string
          parent_id: string
          loadout_qty: number
        }
        Insert: {
          sub_item_id: string
          parent_id: string
          loadout_qty?: number
        }
        Update: Partial<{ loadout_qty: number }>
        Relationships: []
      }
      issue_flag_items: {
        Row: {
          id: string
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          reported_at: string
          resolved_at: string | null
          resolved_action: ResolvedAction | null
        }
        Insert: {
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          resolved_at?: string | null
          resolved_action?: ResolvedAction | null
        }
        Update: Partial<{
          resolved_at: string | null
          resolved_action: ResolvedAction | null
        }>
        Relationships: []
      }
      out_of_service_items: {
        Row: {
          id: string
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          return_date: string | null
          created_at: string
          returned_at: string | null
        }
        Insert: {
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          return_date?: string | null
          returned_at?: string | null
        }
        Update: Partial<{ return_date: string | null; returned_at: string | null }>
        Relationships: []
      }
      equipment_oos: {
        Row: {
          id: string
          equipment_id: string
          quantity: number
          issue_description: string | null
          expected_return_date: string | null
          returned_at: string | null
          created_at: string
        }
        Insert: {
          equipment_id: string
          quantity?: number
          issue_description?: string | null
          expected_return_date?: string | null
          returned_at?: string | null
        }
        Update: Partial<{
          returned_at: string | null
        }>
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          zenbooker_job_id: string | null
          customer_name: string
          event_date: string | null
          end_date: string | null
          start_time: string | null
          end_time: string | null
          chain: string | null
          status: BookingStatus
          event_type: EventType
          source: BookingSource
          address: string
          notes: string
          linked_booking_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          zenbooker_job_id: string | null
          customer_name: string
          event_date?: string | null
          end_date?: string | null
          start_time?: string | null
          end_time?: string | null
          chain?: string | null
          status: BookingStatus
          event_type: EventType
          source: BookingSource
          address: string
          notes: string
          linked_booking_id?: string | null
        }
        Update: Partial<{
          customer_name: string
          event_date: string | null
          end_date: string | null
          start_time: string | null
          end_time: string | null
          chain: string | null
          status: BookingStatus
          event_type: EventType
          address: string
          notes: string
          linked_booking_id: string | null
        }>
        Relationships: []
      }
      booking_items: {
        Row: {
          id: string
          booking_id: string
          item_id: string
          qty: number
          is_sub_item: boolean
          parent_item_id: string | null
        }
        Insert: {
          booking_id: string
          item_id: string
          qty: number
          is_sub_item: boolean
          parent_item_id?: string | null
        }
        Update: Partial<{ qty: number }>
        Relationships: []
      }
      chains: {
        Row: {
          id: string
          name: string
          color: string
          is_active: boolean
        }
        Insert: {
          id: string
          name: string
          color: string
          is_active?: boolean
        }
        Update: Partial<{ name: string; color: string; is_active: boolean }>
        Relationships: []
      }
      chain_mappings: {
        Row: {
          id: string
          zenbooker_staff_id: string
          zenbooker_staff_name: string
          chain_id: string
          notes: string
        }
        Insert: {
          zenbooker_staff_id: string
          zenbooker_staff_name: string
          chain_id: string
          notes: string
        }
        Update: Partial<{
          zenbooker_staff_name: string
          chain_id: string
          notes: string
        }>
        Relationships: []
      }
      service_mappings: {
        Row: {
          id: string
          zenbooker_service_id: string
          zenbooker_service_name: string
          zenbooker_modifier_id: string | null
          zenbooker_modifier_name: string | null
          item_id: string | null
          default_qty: number
          use_customer_qty: boolean
          is_skip: boolean
          notes: string
        }
        Insert: {
          zenbooker_service_id: string
          zenbooker_service_name: string
          zenbooker_modifier_id?: string | null
          zenbooker_modifier_name?: string | null
          item_id?: string | null
          default_qty: number
          use_customer_qty: boolean
          is_skip?: boolean
          notes: string
        }
        Update: Partial<{
          zenbooker_service_name: string
          zenbooker_modifier_name: string | null
          item_id: string | null
          default_qty: number
          use_customer_qty: boolean
          is_skip: boolean
          notes: string
        }>
        Relationships: []
      }
      webhook_logs: {
        Row: {
          id: string
          received_at: string
          zenbooker_job_id: string
          action: string
          raw_payload: Record<string, unknown>
          result: WebhookResult | null
          result_detail: string | null
          booking_id: string | null
        }
        Insert: {
          received_at: string
          zenbooker_job_id: string
          action: string
          raw_payload: Record<string, unknown>
          result?: WebhookResult | null
          result_detail?: string | null
          booking_id?: string | null
        }
        Update: Partial<{
          result: WebhookResult | null
          result_detail: string | null
          booking_id: string | null
        }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      booking_status: BookingStatus
      event_type: EventType
      booking_source: BookingSource
      item_type: ItemType
      resolved_action: ResolvedAction
      webhook_result: WebhookResult
    }
  }
}
