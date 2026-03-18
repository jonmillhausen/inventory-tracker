export type UserRole = 'admin' | 'sales' | 'staff' | 'readonly'
export type BookingStatus = 'confirmed' | 'canceled' | 'completed' | 'needs_review'
export type EventType = 'coordinated' | 'dropoff' | 'pickup' | 'willcall'
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
          created_at: string
        }
        Insert: {
          id: string
          full_name: string
          role: UserRole
        }
        Update: Partial<{ full_name: string; role: UserRole }>
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
        }
        Update: Partial<{
          name: string
          total_qty: number
          is_active: boolean
          custom_setup_min: number | null
          custom_cleanup_min: number | null
        }>
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
      }
      bookings: {
        Row: {
          id: string
          zenbooker_job_id: string
          customer_name: string
          event_date: string
          end_date: string | null
          start_time: string
          end_time: string
          chain: string | null
          status: BookingStatus
          event_type: EventType
          source: BookingSource
          address: string
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          zenbooker_job_id: string
          customer_name: string
          event_date: string
          end_date?: string | null
          start_time: string
          end_time: string
          chain?: string | null
          status: BookingStatus
          event_type: EventType
          source: BookingSource
          address: string
          notes: string
        }
        Update: Partial<{
          customer_name: string
          event_date: string
          end_date: string | null
          start_time: string
          end_time: string
          chain: string | null
          status: BookingStatus
          event_type: EventType
          address: string
          notes: string
        }>
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
      }
      service_mappings: {
        Row: {
          id: string
          zenbooker_service_id: string
          zenbooker_service_name: string
          zenbooker_modifier_id: string | null
          zenbooker_modifier_name: string | null
          item_id: string
          default_qty: number
          use_customer_qty: boolean
          notes: string
        }
        Insert: {
          zenbooker_service_id: string
          zenbooker_service_name: string
          zenbooker_modifier_id?: string | null
          zenbooker_modifier_name?: string | null
          item_id: string
          default_qty: number
          use_customer_qty: boolean
          notes: string
        }
        Update: Partial<{
          zenbooker_service_name: string
          zenbooker_modifier_name: string | null
          item_id: string
          default_qty: number
          use_customer_qty: boolean
          notes: string
        }>
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
      }
    }
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
