"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { JobStatusBadge } from "@/components/job-status-badge";
import { PdfPreview } from "@/components/pdf-preview";
import { UploadDropzone } from "@/components/upload-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadJobFile } from "@/lib/api";
import { TOOL_ICONS } from "@/lib/tools";
import { cn, extensionOf, formatBytes } from "@/lib/utils";
import { findTool, getFormats } from "@/services/formats";
import { createConversion, getJob } from "@/services/conversions";
import { usePendingFileStore } from "@/store/pending-file";
import type { ConversionJob, Tool, ToolOption } from "@/types";

const REQUIRED_OPTIONS: Record<string, string[]> = {
  "remove-pages": ["pages"],
  "reorder-pdf": ["order"],
};

function defaultsFor(tool: Tool): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const option of tool.options) {
    result[option.name] = (option.default ?? "") as string | number | boolean;
  }
  return result;
}

function terminal(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "expired";
}

export function Converter({ toolId }: { toolId: string }) {
  const formatsQuery = useQuery({ queryKey: ["formats"], queryFn: getFormats, staleTime: 60_000 });
  const tool = findTool(formatsQuery.data, toolId);

  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Record<string, string | number | boolean>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const notified = useRef<string | null>(null);

  const maxUploadMb = formatsQuery.data?.capabilities.limits.max_upload_mb ?? 25;

  useEffect(() => {
    if (!tool) return;
    setOptions(defaultsFor(tool));
    setFiles([]);
    setJobId(null);
    setFormError(null);
    const pending = usePendingFileStore.getState().consume();
    if (pending && tool.inputs.includes(`.${extensionOf(pending.name)}`)) {
      setFiles([pending]);
    }
  }, [tool?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const jobQuery = useQuery({
    queryKey: ["conversion", jobId],
    queryFn: () => getJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (terminal(query.state.data?.status) ? false : 1500),
  });

  const job = jobQuery.data;

  useEffect(() => {
    if (!jobId) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [jobId]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "completed" && notified.current !== job.id) {
      notified.current = job.id;
      toast.success("Konversi selesai", { description: job.output_filename ?? undefined });
    }
    if (job.status === "failed" && notified.current !== job.id) {
      notified.current = job.id;
      toast.error("Konversi gagal", { description: job.error_message ?? undefined });
    }
  }, [job]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!tool) throw new Error("Alat tidak ditemukan.");
      return createConversion({ tool: tool.id, files, options });
    },
    onSuccess: (created) => {
      setFormError(null);
      notified.current = null;
      setJobId(created.id);
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast.error("Tidak dapat memulai konversi", { description: error.message });
    },
  });

  const busy = job?.status === "queued" || job?.status === "processing" || mutation.isPending;

  function validate(): string | null {
    if (!tool) return "Alat tidak ditemukan.";
    if (files.length < tool.min_files) {
      return `Pilih minimal ${tool.min_files} berkas.`;
    }
    if (files.length > tool.max_files) {
      return `Maksimal ${tool.max_files} berkas untuk alat ini.`;
    }
    for (const file of files) {
      if (!tool.inputs.includes(`.${extensionOf(file.name)}`)) {
        return `${file.name}: format tidak didukung oleh alat ini.`;
      }
      if (file.size > maxUploadMb * 1024 * 1024) {
        return `${file.name}: melebihi batas ${maxUploadMb} MB.`;
      }
      if (file.size === 0) return `${file.name}: berkas kosong.`;
    }
    for (const name of REQUIRED_OPTIONS[tool.id] ?? []) {
      if (!String(options[name] ?? "").trim()) {
        const option = tool.options.find((item) => item.name === name);
        return `${option?.label ?? name} wajib diisi.`;
      }
    }
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const message = validate();
    if (message) {
      setFormError(message);
      return;
    }
    setFormError(null);
    setJobId(null);
    mutation.mutate();
  }

  async function handleDownload() {
    if (!job?.download_url) return;
    setDownloading(true);
    try {
      await downloadJobFile(job.download_url, job.output_filename || "hasil");
    } catch (error) {
      toast.error("Unduhan gagal", { description: (error as Error).message });
    } finally {
      setDownloading(false);
    }
  }

  function reset() {
    setJobId(null);
    setFiles([]);
    setFormError(null);
    if (tool) setOptions(defaultsFor(tool));
  }

  const Icon = useMemo(() => TOOL_ICONS[toolId] ?? FileText, [toolId]);
  const isPdfFirst = files[0]?.name.toLowerCase().endsWith(".pdf");

  if (formatsQuery.isLoading) {
    return (
      <div className="container max-w-6xl py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (formatsQuery.isError) {
    return (
      <div className="container max-w-3xl py-16">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">Backend tidak dapat dihubungi</h1>
          <p className="mt-2 text-sm text-muted-foreground">{(formatsQuery.error as Error).message}</p>
          <Button className="mt-4" onClick={() => void formatsQuery.refetch()}>Coba lagi</Button>
        </div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="container max-w-3xl py-16 text-center">
        <h1 className="text-2xl font-semibold">Alat konversi tidak ditemukan</h1>
        <p className="mt-2 text-muted-foreground">Alat yang Anda cari tidak tersedia di server ini.</p>
        <Button className="mt-6" asChild><Link href="/tools">Lihat semua alat</Link></Button>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 sm:py-10">
      <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Semua alat
      </Link>

      <div className="mt-5 flex flex-wrap items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tool.label}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {tool.output.toUpperCase()}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{tool.description}</p>
        </div>
      </div>

      {!tool.available && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Alat ini belum tersedia di server</p>
            <p className="text-muted-foreground">{tool.unavailable_reason}</p>
          </div>
        </div>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                Unggah berkas
              </CardTitle>
              <CardDescription>
                Format diterima: {tool.inputs.join(", ")}. Validasi format dan isi berkas dilakukan di server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadDropzone
                files={files}
                onFilesChange={setFiles}
                extensions={tool.inputs}
                maxFiles={tool.max_files}
                maxSizeMb={maxUploadMb}
                disabled={!tool.available || busy}
              />
              {isPdfFirst && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Pratinjau</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((value) => !value)}>
                      {showPreview ? "Sembunyikan" : "Tampilkan"}
                    </Button>
                  </div>
                  {showPreview && <PdfPreview file={files[0]} />}
                </div>
              )}
            </CardContent>
          </Card>

          {tool.options.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                  Opsi konversi
                </CardTitle>
                <CardDescription>Pengaturan ini dikirim ke mesin konversi di backend.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {tool.options.map((option) => (
                    <OptionField
                      key={option.name}
                      option={option}
                      value={options[option.name]}
                      onChange={(value) => setOptions((current) => ({ ...current, [option.name]: value }))}
                      disabled={!tool.available || busy}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" disabled={!tool.available || busy || files.length === 0}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Memproses…" : `Konversi ke ${tool.output.toUpperCase()}`}
              </Button>
              <p className="text-xs text-muted-foreground">
                Hasil tersedia maksimal {formatsQuery.data?.capabilities.limits.result_ttl_hours ?? 24} jam.
              </p>
            </div>
          </form>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status konversi</CardTitle>
            </CardHeader>
            <CardContent>
              {!jobId && !mutation.isPending && (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Info className="h-4 w-4" /> Unggah berkas lalu mulai konversi.
                  </div>
                  <dl className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Input</dt>
                      <dd className="font-medium">{tool.inputs.join(", ")}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Output</dt>
                      <dd className="font-medium">{tool.output}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Batas per berkas</dt>
                      <dd className="font-medium">{maxUploadMb} MB</dd>
                    </div>
                  </dl>
                  {tool.processing_note && (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {tool.processing_note}
                    </p>
                  )}
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    Berkas hanya diproses di server ini dan dihapus otomatis setelah masa berlaku.
                  </p>
                </div>
              )}

              {mutation.isPending && (
                <div className="flex items-center gap-3 text-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Mengunggah berkas…</p>
                    <p className="text-xs text-muted-foreground">Menunggu server memulai pekerjaan.</p>
                  </div>
                </div>
              )}

              {job && (
                <div className="animate-fade-in space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <JobStatusBadge status={job.status} />
                    {(job.status === "queued" || job.status === "processing") && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {elapsed} detik
                      </span>
                    )}
                  </div>

                  {(job.status === "queued" || job.status === "processing") && (
                    <div className="space-y-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-1/3 animate-shimmer rounded-full bg-primary/70" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Berkas sedang diproses di server. Persentase tidak ditampilkan karena backend
                        tidak melaporkan kemajuan per tahap.
                      </p>
                    </div>
                  )}

                  {job.status === "completed" && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{job.output_filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(job.output_size)} · {job.output_format.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <Button className="w-full" onClick={() => void handleDownload()} disabled={downloading || !job.download_url}>
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Unduh hasil
                      </Button>
                      <Button variant="outline" className="w-full" onClick={reset}>
                        <RotateCcw className="h-4 w-4" /> Konversi berkas lain
                      </Button>
                    </div>
                  )}

                  {job.status === "failed" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        {job.error_message ?? "Konversi gagal."}
                      </div>
                      <Button variant="outline" className="w-full" onClick={() => { setJobId(null); mutation.mutate(); }}>
                        <RotateCcw className="h-4 w-4" /> Coba lagi
                      </Button>
                      <Button variant="ghost" className="w-full" onClick={reset}>Pilih berkas lain</Button>
                    </div>
                  )}

                  {job.status === "expired" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                        Hasil sudah dihapus karena melewati masa penyimpanan.
                      </div>
                      <Button variant="outline" className="w-full" onClick={reset}>Konversi ulang</Button>
                    </div>
                  )}

                  {job.warnings.length > 0 && (
                    <details className="rounded-lg bg-muted/50 p-3 text-xs">
                      <summary className="cursor-pointer font-medium">
                        Catatan hasil ({job.warnings.length})
                      </summary>
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-muted-foreground">
                        {job.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className={cn("rounded-lg border bg-card/60 p-4 text-xs text-muted-foreground", !tool.available && "opacity-60")}>
            Ingin riwayat konversi tersimpan?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">Buat akun gratis</Link>{" "}
            atau masuk untuk mengaksesnya dari perangkat lain.
          </div>
        </aside>
      </div>
    </div>
  );
}

function OptionField({
  option,
  value,
  onChange,
  disabled,
}: {
  option: ToolOption;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
  disabled?: boolean;
}) {
  if (option.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
        />
        <span>
          <span className="font-medium">{option.label}</span>
          {option.help && <span className="mt-0.5 block text-xs text-muted-foreground">{option.help}</span>}
        </span>
      </label>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`option-${option.name}`}>{option.label}</Label>
      {option.type === "select" ? (
        <Select
          id={`option-${option.name}`}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {option.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </Select>
      ) : (
        <Input
          id={`option-${option.name}`}
          type={option.type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          onChange={(event) => onChange(option.type === "number" ? Number(event.target.value) : event.target.value)}
          placeholder={option.placeholder ?? undefined}
          min={option.min ?? undefined}
          max={option.max ?? undefined}
          disabled={disabled}
        />
      )}
      {option.help && <p className="text-xs text-muted-foreground">{option.help}</p>}
    </div>
  );
}
