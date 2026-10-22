"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileClock,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { JobStatusBadge } from "@/components/job-status-badge";
import { StatsChart } from "@/components/stats-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatRelative } from "@/lib/utils";
import { getStats, listJobs } from "@/services/conversions";
import { useAuthStore } from "@/store/auth";

export default function DashboardPage() {
  const { user, status } = useAuthStore();
  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: 5000,
  });
  const activeQuery = useQuery({
    queryKey: ["jobs", "active"],
    queryFn: () => listJobs({ pageSize: 5, status: "processing" }),
    refetchInterval: 3000,
  });
  const queuedQuery = useQuery({
    queryKey: ["jobs", "queued"],
    queryFn: () => listJobs({ pageSize: 5, status: "queued" }),
    refetchInterval: 3000,
  });

  const stats = statsQuery.data;
  const activeJobs = [...(queuedQuery.data?.items ?? []), ...(activeQuery.data?.items ?? [])];

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {user ? `Halo, ${user.name.split(" ")[0]}` : "Dashboard"}
            </h1>
            <Badge variant={user ? "default" : "secondary"}>
              {user ? <><UserRound className="h-3 w-3" /> Akun</> : "Mode tamu"}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            Ringkasan pekerjaan konversi, aktivitas terbaru, dan batas penggunaan Anda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/history"><FileClock className="h-4 w-4" /> Riwayat</Link>
          </Button>
          <Button asChild>
            <Link href="/convert"><Plus className="h-4 w-4" /> Konversi baru</Link>
          </Button>
        </div>
      </div>

      {!user && status !== "loading" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
          <p className="text-muted-foreground">
            Anda menggunakan mode tamu. Riwayat terikat pada peramban ini.
          </p>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link href="/register">Daftar untuk menyimpan riwayat lintas perangkat <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      )}

      {statsQuery.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Statistik tidak dapat dimuat</p>
          <p className="text-muted-foreground">{(statsQuery.error as Error).message}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void statsQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
          </Button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          loading={statsQuery.isLoading}
          icon={TrendingUp}
          label="Total dokumen diproses"
          value={stats ? String(stats.total) : "—"}
          hint={stats ? `${stats.completed} berhasil · ${stats.failed} gagal` : ""}
        />
        <StatCard
          loading={statsQuery.isLoading}
          icon={CheckCircle2}
          label="Tingkat keberhasilan"
          value={stats ? `${stats.success_rate}%` : "—"}
          hint="Dari pekerjaan yang sudah selesai"
        />
        <StatCard
          loading={statsQuery.isLoading}
          icon={Loader2}
          label="Sedang diproses"
          value={stats ? String(stats.processing) : "—"}
          hint="Termasuk antrean"
        />
        <StatCard
          loading={statsQuery.isLoading}
          icon={HardDrive}
          label="Ukuran hasil"
          value={stats ? formatBytes(stats.processed_bytes) : "—"}
          hint="Total berkas hasil yang masih tersimpan"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Statistik konversi</CardTitle>
                <CardDescription>Status pekerjaan yang tercatat untuk identitas Anda.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void statsQuery.refetch()} aria-label="Muat ulang statistik">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : (
                <StatsChart
                  completed={stats?.completed ?? 0}
                  failed={stats?.failed ?? 0}
                  processing={stats?.processing ?? 0}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Aktivitas terbaru</CardTitle>
                <CardDescription>Lima pekerjaan terakhir berdasarkan waktu dibuat.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/history">Semua</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
              {!statsQuery.isLoading && (stats?.recent.length ?? 0) === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <FileClock className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">Belum ada aktivitas</p>
                  <p className="mt-1 text-sm text-muted-foreground">Konversi berkas pertama Anda untuk melihat riwayat di sini.</p>
                  <Button className="mt-4" asChild><Link href="/convert">Mulai konversi</Link></Button>
                </div>
              )}
              <ul className="divide-y">
                {stats?.recent.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{job.original_filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.tool} · {formatBytes(job.file_size)} · {formatRelative(job.created_at)}
                      </p>
                    </div>
                    <JobStatusBadge status={job.status} />
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/convert/${job.tool}`}>Ulangi</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-amber-500" /> Berkas yang masih diproses
              </CardTitle>
              <CardDescription>Diperbarui otomatis setiap 3 detik.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada pekerjaan aktif.</p>
              ) : (
                <ul className="space-y-3">
                  {activeJobs.map((job) => (
                    <li key={job.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{job.original_filename}</p>
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {job.tool} · {job.status === "queued" ? "menunggu antrean" : "sedang dikonversi"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batas & penggunaan</CardTitle>
              <CardDescription>Kebijakan yang berlaku di server ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <UsageRow label="Ukuran maksimum per berkas" value={`${stats?.usage.max_upload_mb ?? "—"} MB`} />
              <UsageRow label="Berkas per pekerjaan" value={String(stats?.usage.max_files_per_job ?? "—")} />
              <UsageRow label="Masa simpan hasil" value={`${stats?.usage.result_ttl_hours ?? "—"} jam`} />
              <UsageRow label="Konversi gagal" value={String(stats?.failed ?? 0)} />
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                Berkas masukan dihapus setelah pekerjaan selesai. Hasil konversi dihapus otomatis saat masa simpan berakhir.
              </div>
            </CardContent>
          </Card>

          <div className="flex items-start gap-3 rounded-xl border border-dashed bg-card/50 p-4 text-xs text-muted-foreground">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>
              Dokumen sensitif? Gunakan akun Anda dan hapus riwayat setelah selesai. Isi dokumen tidak pernah dicatat di log.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  loading,
  icon: Icon,
  label,
  value,
  hint,
}: {
  loading: boolean;
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
