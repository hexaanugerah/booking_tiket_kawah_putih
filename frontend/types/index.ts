export type JobStatus = "queued" | "processing" | "completed" | "failed" | "expired";

export type ToolCategory = "pdf" | "word" | "excel" | "powerpoint" | "image" | "text";

export interface ToolOptionChoice {
  value: string;
  label: string;
}

export interface ToolOption {
  name: string;
  label: string;
  type: "select" | "text" | "number" | "checkbox" | "pages" | string;
  default: string | number | boolean | null;
  choices: ToolOptionChoice[];
  help?: string | null;
  placeholder?: string | null;
  min?: number | null;
  max?: number | null;
}

export interface Tool {
  id: string;
  label: string;
  description: string;
  category: ToolCategory;
  inputs: string[];
  output: string;
  available: boolean;
  unavailable_reason?: string | null;
  multiple: boolean;
  min_files: number;
  max_files: number;
  processing_note?: string | null;
  options: ToolOption[];
}

export interface FormatsResponse {
  tools: Tool[];
  categories: { id: string; label: string }[];
  formats: { input: string[]; output: string[] };
  capabilities: {
    libreoffice: { available: boolean; path?: string | null; used_for: string[] };
    ocr: { available: boolean; engine?: string | null; languages: string[] };
    libraries: Record<string, string>;
    limits: { max_upload_mb: number; max_files_per_job: number; result_ttl_hours: number };
  };
}

export interface ConversionJob {
  id: string;
  tool: string;
  original_filename: string;
  input_format: string;
  output_format: string;
  status: JobStatus;
  file_size: number;
  output_filename?: string | null;
  output_size?: number | null;
  error_message?: string | null;
  warnings: string[];
  options: Record<string, unknown>;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  expires_at?: string | null;
  download_url?: string | null;
}

export interface ConversionList {
  items: ConversionJob[];
  total: number;
  page: number;
  page_size: number;
}

export interface Usage {
  max_upload_mb: number;
  max_files_per_job: number;
  result_ttl_hours: number;
  allow_anonymous: boolean;
}

export interface ConversionStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  success_rate: number;
  processed_bytes: number;
  recent: ConversionJob[];
  usage: Usage;
}

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  token_type: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user: User | null;
  anonymous_allowed: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
