/**
 * Database types for Supabase.
 * These types are generated from the database schema.
 * Run `npx supabase gen types typescript --project-id your-project-id > src/types/database.ts` to regenerate.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface ReferenceImage {
  storage_path: string | null;
  url: string;
}

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          story: string | null;
          style: string | null;
          stage: project_stage;
          reference_images: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          story?: string | null;
          style?: string | null;
          stage?: project_stage;
          reference_images?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          story?: string | null;
          style?: string | null;
          stage?: project_stage;
          reference_images?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      scenes: {
        Row: {
          id: string;
          project_id: string;
          order_index: number;
          description: string;
          description_confirmed: boolean;
          image_status: image_status;
          image_confirmed: boolean;
          video_status: video_status;
          video_confirmed: boolean;
          mode: scene_mode;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          order_index: number;
          description: string;
          description_confirmed?: boolean;
          image_status?: image_status;
          image_confirmed?: boolean;
          video_status?: video_status;
          video_confirmed?: boolean;
          mode?: scene_mode;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          order_index?: number;
          description?: string;
          description_confirmed?: boolean;
          image_status?: image_status;
          image_confirmed?: boolean;
          video_status?: video_status;
          video_confirmed?: boolean;
          mode?: scene_mode;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      images: {
        Row: {
          id: string;
          scene_id: string;
          storage_path: string;
          url: string;
          width: number | null;
          height: number | null;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          storage_path: string;
          url: string;
          width?: number | null;
          height?: number | null;
          version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          storage_path?: string;
          url?: string;
          width?: number | null;
          height?: number | null;
          version?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "images_scene_id_fkey";
            columns: ["scene_id"];
            isOneToOne: false;
            referencedRelation: "scenes";
            referencedColumns: ["id"];
          },
        ];
      };
      videos: {
        Row: {
          id: string;
          scene_id: string;
          storage_path: string;
          url: string;
          duration: number | null;
          task_id: string | null;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          storage_path: string;
          url: string;
          duration?: number | null;
          task_id?: string | null;
          version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          storage_path?: string;
          url?: string;
          duration?: number | null;
          task_id?: string | null;
          version?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "videos_scene_id_fkey";
            columns: ["scene_id"];
            isOneToOne: false;
            referencedRelation: "scenes";
            referencedColumns: ["id"];
          },
        ];
      };
      materials: {
        Row: {
          id: string;
          scene_id: string;
          type: material_type;
          storage_path: string;
          url: string;
          metadata: Json | null;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          type: material_type;
          storage_path: string;
          url: string;
          metadata?: Json | null;
          order_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          type?: material_type;
          storage_path?: string;
          url?: string;
          metadata?: Json | null;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "materials_scene_id_fkey";
            columns: ["scene_id"];
            isOneToOne: false;
            referencedRelation: "scenes";
            referencedColumns: ["id"];
          },
        ];
      };
      video_chains: {
        Row: {
          id: string;
          project_id: string;
          name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "video_chains_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      video_chain_items: {
        Row: {
          id: string;
          chain_id: string;
          video_id: string;
          order_index: number;
          parent_video_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chain_id: string;
          video_id: string;
          order_index: number;
          parent_video_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chain_id?: string;
          video_id?: string;
          order_index?: number;
          parent_video_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "video_chain_items_chain_id_fkey";
            columns: ["chain_id"];
            isOneToOne: false;
            referencedRelation: "video_chains";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_chain_items_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_chain_items_parent_video_id_fkey";
            columns: ["parent_video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      project_stage: project_stage;
      image_status: image_status;
      video_status: video_status;
      material_type: material_type;
      scene_mode: scene_mode;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Enum types
export type project_stage = "draft" | "scenes" | "images" | "videos" | "completed";
export type image_status = "pending" | "processing" | "completed" | "failed";
export type video_status = "pending" | "processing" | "completed" | "failed";
export type material_type = "audio" | "video" | "image" | "text";
export type scene_mode = "story" | "free";

// Convenience types for tables
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export type Scene = Database["public"]["Tables"]["scenes"]["Row"];
export type SceneInsert = Database["public"]["Tables"]["scenes"]["Insert"];
export type SceneUpdate = Database["public"]["Tables"]["scenes"]["Update"];

export type Image = Database["public"]["Tables"]["images"]["Row"];
export type ImageInsert = Database["public"]["Tables"]["images"]["Insert"];
export type ImageUpdate = Database["public"]["Tables"]["images"]["Update"];

export type Video = Database["public"]["Tables"]["videos"]["Row"];
export type VideoInsert = Database["public"]["Tables"]["videos"]["Insert"];
export type VideoUpdate = Database["public"]["Tables"]["videos"]["Update"];

export type Material = Database["public"]["Tables"]["materials"]["Row"];
export type MaterialInsert = Database["public"]["Tables"]["materials"]["Insert"];
export type MaterialUpdate = Database["public"]["Tables"]["materials"]["Update"];

export type VideoChain = Database["public"]["Tables"]["video_chains"]["Row"];
export type VideoChainInsert = Database["public"]["Tables"]["video_chains"]["Insert"];
export type VideoChainUpdate = Database["public"]["Tables"]["video_chains"]["Update"];

export type VideoChainItem = Database["public"]["Tables"]["video_chain_items"]["Row"];
export type VideoChainItemInsert = Database["public"]["Tables"]["video_chain_items"]["Insert"];
export type VideoChainItemUpdate = Database["public"]["Tables"]["video_chain_items"]["Update"];

// Combined types for API responses
export type SceneWithMedia = Scene & {
  images: Image[];
  videos: Video[];
};

export type ProjectWithScenes = Project & {
  scenes: SceneWithMedia[];
};
