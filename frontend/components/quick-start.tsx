"use client";

import { ArrowRight, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { extensionOf } from "@/lib/utils";
import { findTool, getFormats } from "@/services/formats";
import { usePendingFileStore } from "@/store/pending-file";
import type { FormatsResponse } from "@/types";

const TOOL_BY_EXTENSION: Record<string, string> = {
  pdf: "pdf-to-word",
  docx: "docx-to-pdf",
  xlsx: "xlsx-to-pdf",
  pptx: "pptx-to-pdf",
  png: "image-to-pdf",
  jpg: "image-to-pdf",
  jpeg: "image-to-pdf",
  webp: "image-to-pdf",
  bmp: "image-to-pdf",
  tif: "image-to-pdf",
  tiff: "image-to-pdf",
  txt: "txt-to-pdf",
  md: "markdown-to-pdf",
  markdown: "markdown-to-pdf",
  html: "html-to-pdf",
  htm: "html-to-pdf",
  csv: "csv-to-xlsx",
};

export function QuickStart({ formats }: { formats?: FormatsResponse }) {
  const router = useRouter();
  const setPendingFile = usePendingFileStore((state) => state.setFile);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const extension = extensionOf(file.name);
      const toolId = TOOL_BY_EXTENSION[extension];
      if (!toolId) {
        toast.error("Format belum didukung", { description: `Berkas .${extension} belum dapat dikonversi.` });
        return;
      }
      const tool = findTool(formats, toolId);
      if (formats && (!tool || !tool.available)) {
        toast.error("Alat tidak tersedia", {
          description: tool?.unavailable_reason ?? "Server ini belum mendukung konversi tersebut.",
        });
        return;
      }
      setPendingFile(file);
      router.push(`/convert/${toolId}`);
    },
    [formats, router, setPendingFile],
  );

  const { getRootProps, getInputProps, open } = useDropzone({
    multiple: false,
    noClick: true,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
    onDrop: (accepted) => {
      setDragActive(false);
      if (accepted[0]) void handleFile(accepted[0]);
    },
    onDropRejected: () => {
      setDragActive(false);
      toast.error("Berkas tidak dapat dibaca.");
    },
  });

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-lg shadow-primary/5 sm:p-5">
      <div
        {...getRootProps()}
        className={`rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
          dragActive ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        }`}
      >
        <input {...getInputProps()} aria-label="Pilih berkas untuk mulai konversi" />
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <UploadCloud className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-4 text-base font-semibold">Tarik berkas ke sini</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Kami akan memilih alat konversi yang tepat secara otomatis.
        </p>
        <Button className="mt-4" onClick={open} type="button">
          Pilih berkas <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          PDF · DOCX · XLSX · PPTX · PNG · JPG · TXT · MD · HTML · CSV
        </p>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {formats ? `Batas ${formats.capabilities.limits.max_upload_mb} MB · hasil tersimpan ${formats.capabilities.limits.result_ttl_hours} jam` : "Validasi berkas dilakukan di server"}
      </div>
    </div>
  );
}
