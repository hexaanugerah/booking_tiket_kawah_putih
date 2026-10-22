import { apiFetch } from "@/lib/api";
import type { FormatsResponse, Tool } from "@/types";

export function getFormats(): Promise<FormatsResponse> {
  return apiFetch<FormatsResponse>("/api/v1/formats");
}

export function findTool(formats: FormatsResponse | undefined, toolId: string): Tool | undefined {
  return formats?.tools.find((tool) => tool.id === toolId);
}
