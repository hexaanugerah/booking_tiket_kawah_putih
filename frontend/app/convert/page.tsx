import type { Metadata } from "next";
import Link from "next/link";

import { ToolsExplorer } from "@/components/tools-explorer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Konversi Dokumen",
  description: "Mulai konversi dokumen baru dengan alat yang tersedia di server.",
};

export default function ConvertPage() {
  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight">Mulai konversi baru</h1>
          <p className="mt-2 text-muted-foreground">
            Pilih alat, unggah berkas, lalu tentukan opsi yang tersedia. Riwayat pekerjaan dapat dilihat kapan saja.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/history">Riwayat konversi</Link>
        </Button>
      </div>
      <div className="mt-8">
        <ToolsExplorer />
      </div>
    </div>
  );
}
