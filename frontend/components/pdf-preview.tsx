"use client";

import { FileWarning, Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

export function PdfPreview({ file }: { file: File }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [pageCount, setPageCount] = useState(0);
  const [objectUrl, setObjectUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let documentProxy: PDFDocumentProxy | null = null;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setStatus("loading");

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = new Uint8Array(await file.arrayBuffer());
        const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
        documentProxy = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(documentProxy.numPages);
        const page = await documentProxy.getPage(1);
        if (!page) throw new Error("Page unavailable");
        const width = containerRef.current?.clientWidth ?? 640;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, width / base.width) });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) throw new Error("Canvas unavailable");
        const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        await page.render({
          canvasContext: context,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        }).promise;
        if (!cancelled) setStatus("ready");
      } catch (error) {
        console.warn("PDF.js preview failed, falling back to the browser viewer.", error);
        if (!cancelled) setStatus("fallback");
      }
    })();

    return () => {
      cancelled = true;
      void documentProxy?.destroy?.();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div ref={containerRef} className="relative overflow-hidden rounded-md bg-white">
        <canvas
          ref={canvasRef}
          className={status === "ready" ? "block w-full" : "hidden"}
          aria-label="Pratinjau halaman pertama PDF"
        />
        {status === "loading" && (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-xs">Memuat pratinjau PDF…</p>
          </div>
        )}
        {status === "fallback" && objectUrl && (
          <iframe src={objectUrl} title="Pratinjau PDF" className="h-[420px] w-full" />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{pageCount > 0 ? `Halaman 1 dari ${pageCount}` : "Pratinjau PDF"}</span>
        {status === "fallback" && (
          <span className="flex items-center gap-1">
            <FileWarning className="h-3.5 w-3.5" /> Viewer bawaan browser
          </span>
        )}
      </div>
    </div>
  );
}
