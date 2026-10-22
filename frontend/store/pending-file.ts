"use client";

import { create } from "zustand";

interface PendingFileState {
  file: File | null;
  setFile: (file: File | null) => void;
  consume: () => File | null;
}

export const usePendingFileStore = create<PendingFileState>((set, get) => ({
  file: null,
  setFile: (file) => set({ file }),
  consume: () => {
    const file = get().file;
    set({ file: null });
    return file;
  },
}));
