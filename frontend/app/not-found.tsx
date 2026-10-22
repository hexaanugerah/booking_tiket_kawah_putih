import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Tautan yang Anda buka mungkin sudah dipindahkan atau alat konversi yang dicari tidak tersedia.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild><Link href="/">Kembali ke beranda</Link></Button>
        <Button variant="outline" asChild><Link href="/tools">Lihat alat konversi</Link></Button>
      </div>
    </div>
  );
}
