import type { Attachment, BaseRecord, Item, Note, Task, Trip } from './models'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type TableDefinition<Row extends BaseRecord, Required extends keyof Row> = {
  Row: { [Key in keyof Row]: Row[Key] }
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>
  Update: Partial<Omit<Row, 'id' | 'created_at' | 'updated_at' | 'version'>>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      thailand_trips: TableDefinition<Trip, 'owner_id' | 'title' | 'start_date' | 'end_date'>
      thailand_itinerary_items: TableDefinition<Item, 'trip_id' | 'type' | 'title'>
      thailand_tasks: TableDefinition<Task, 'trip_id' | 'title'>
      thailand_notes: TableDefinition<Note, 'trip_id' | 'body'>
      thailand_attachments: TableDefinition<Attachment, 'trip_id' | 'name' | 'path' | 'mime_type' | 'size'>
    }
    Views: { [_ in never]: never }
    Functions: {
      thailand_initialize_trip: {
        Args: {
          p_title: string
          p_start_date: string
          p_end_date: string
          p_timezone: string
          p_items?: Json
          p_tasks?: Json
          p_notes?: Json
        }
        Returns: Json
      }
      thailand_claim_content: {
        Args: { p_table: 'thailand_itinerary_items' | 'thailand_attachments'; p_id: string; p_version: number }
        Returns: Json
      }
      thailand_finalize_content_deletion: {
        Args: { p_claim_id: string; p_owner_id: string }
        Returns: Json
      }
      thailand_consume_shared_login_attempt: {
        Args: { p_ip_key: string }
        Returns: Json
      }
      thailand_shared_account_id: {
        Args: { [_ in never]: never }
        Returns: string | null
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
