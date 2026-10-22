"use client";

import { create } from "zustand";

import { getToken, setToken } from "@/lib/api";
import * as authService from "@/services/auth";
import type { User } from "@/types";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  initialized: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "loading",
  initialized: false,

  hydrate: async () => {
    if (get().initialized) return;
    try {
      const session = await authService.fetchSession();
      if (session.authenticated && session.user) {
        set({ user: session.user, status: "authenticated", initialized: true });
      } else {
        set({ user: null, status: "anonymous", initialized: true });
      }
    } catch {
      set({ user: null, status: "anonymous", initialized: true });
    }
  },

  login: async (email, password) => {
    const response = await authService.loginAccount({ email, password });
    setToken(response.access_token);
    set({ user: response.user, status: "authenticated", initialized: true });
    return response.user;
  },

  register: async (name, email, password) => {
    const response = await authService.registerAccount({ name, email, password });
    setToken(response.access_token);
    set({ user: response.user, status: "authenticated", initialized: true });
    return response.user;
  },

  logout: async () => {
    try {
      await authService.logoutAccount();
    } finally {
      setToken(null);
      set({ user: null, status: "anonymous" });
    }
  },

  setUser: (user) => set({ user, status: user ? "authenticated" : "anonymous" }),

  refresh: async () => {
    if (!getToken()) {
      set({ user: null, status: "anonymous" });
      return;
    }
    try {
      const user = await authService.fetchMe();
      set({ user, status: "authenticated" });
    } catch {
      setToken(null);
      set({ user: null, status: "anonymous" });
    }
  },
}));
