import { apiFetch } from "@/lib/api";
import type { AuthResponse, SessionResponse, User } from "@/types";

export function registerAccount(payload: { name: string; email: string; password: string }) {
  return apiFetch<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginAccount(payload: { email: string; password: string }) {
  return apiFetch<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logoutAccount() {
  return apiFetch<void>("/api/v1/auth/logout", { method: "POST" });
}

export function fetchSession() {
  return apiFetch<SessionResponse>("/api/v1/auth/session");
}

export function fetchMe() {
  return apiFetch<User>("/api/v1/auth/me");
}

export function updateProfile(payload: { name?: string; email?: string }) {
  return apiFetch<User>("/api/v1/auth/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function changePassword(payload: { current_password: string; new_password: string }) {
  return apiFetch<void>("/api/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
