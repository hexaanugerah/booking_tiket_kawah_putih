// Scanner service — operasi scanner ke backend API.

import { apiClient, ApiError } from "@/lib/api/client";
import type {
  ApiResponse,
  ETicket,
  ManagerMonitoring,
  ScanRecord,
  ValidateTicketRequest,
  ValidateTicketResponse,
  ScanHistoryResponse,
  ScanStatsResponse,
  ScanStatus,
} from "@/types/api";

export type { ScanRecord };

export class ScannerError extends Error {}

export interface ScanHistoryParams {
  page?: number;
  limit?: number;
  gate?: string;
  petugas?: string;
  from?: string;
  to?: string;
  status?: string;
}

/** Read-only ticket lookup by ticket UUID, booking code, or QR payload. */
export async function lookupTicket(ref: string): Promise<ETicket | null> {
  try {
    const response = await apiClient.get<{ success: boolean; message?: string; data: ETicket }>(
      "/petugas/scanner/ticket",
      { ref },
    );
    return response.data ?? null;
  } catch {
    return null;
  }
}

export const scannerService = {
  /** Validate a ticket. Backend membungkus hasil di `data`, bukan di root. */
  async validateTicket(payload: ValidateTicketRequest): Promise<ValidateTicketResponse> {
    const response = await apiClient.post<
      ApiResponse<Pick<ValidateTicketResponse, "status" | "ticket"> & { message?: string }>
    >("/petugas/scanner/validate", payload);

    if (!response.success || !response.data) {
      // Jangan diam-diam dianggap INVALID: error jaringan/server harus terlihat
      // berbeda dari tiket yang memang tidak valid.
      throw new ScannerError(response.message || "Gagal memvalidasi tiket");
    }

    return {
      success: response.success,
      message: response.data.message ?? response.message,
      status: response.data.status,
      ticket: response.data.ticket,
    };
  },

  /** Get scan history. */
  async getHistory(params: ScanHistoryParams = {}): Promise<ScanRecord[]> {
    const response = await apiClient.get<ScanHistoryResponse>("/petugas/scanner/history", {
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 20),
      gate: params.gate ?? "",
      petugas: params.petugas ?? "",
      from: params.from ?? "",
      to: params.to ?? "",
    });
    return response.data ?? [];
  },

  /** Get scan stats. */
  async getStats(): Promise<Record<string, number>> {
    const response = await apiClient.get<ScanStatsResponse>("/petugas/scanner/stats");
    return response.data ?? {};
  },

  /** Agregat monitoring untuk manager (tanpa riwayat scan mentah). */
  async getMonitoring(date?: string): Promise<ManagerMonitoring> {
    const response = await apiClient.get<{ success: boolean; message?: string; data: ManagerMonitoring }>(
      "/manager/monitoring",
      date ? { date } : undefined
    );
    if (!response.success) throw new ScannerError(response.message || "Gagal memuat monitoring");
    return response.data!;
  },
};