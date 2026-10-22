"use client";

import { File, UploadCloud, X } from "lucide-react";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn, extensionOf, formatBytes } from "@/lib/utils";

interface UploadDropzoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  extensions: string[];
  maxFiles: number;
  maxSizeMb: number;
  disabled?: boolean;
}

export function UploadDropzone({
  files,
  onFilesChange,
  extensions,
  maxFiles,
  maxSizeMb,
  disabled,
}: UploadDropzoneProps) {
  const accept = extensions.join(", ");
  const maxBytes = maxSizeMb * 1024 * 1024;

  const onDrop = useCallback(
    (accepted: File[]) => {
      const invalid: string[] = [];
      const acceptedFiles: File[] = [];
      for (const file of accepted) {
        if (!extensions.includes(`.${extensionOf(file.name)}`)) {
          invalid.push(`${file.name}: format tidak didukung`);
          continue;
        }
        if (file.size > maxBytes) {
          invalid.push(`${file.name}: melebihi ${maxSizeMb} MB`);
          continue;
        }
        acceptedFiles.push(file);
      }
      if (invalid.length) {
        toast.error("Beberapa berkas tidak dapat ditambahkan", {
          description: invalid.slice(0, 3).join(" • "),
        });
      }
      const combined = [...files, ...acceptedFiles].slice(0, maxFiles);
      if (files.length + acceptedFiles.length > maxFiles) {
        toast.error(`Maksimal ${maxFiles} berkas untuk alat ini.`);
      }
      onFilesChange(combined);
    },
    [extensions, files, maxBytes, maxFiles, maxSizeMb, onFilesChange],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: maxFiles > 1,
    noClick: true,
    disabled,
    maxSize: maxBytes,
  });

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors",
          isDragActive && "border-primary bg-primary/5",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input {...getInputProps()} aria-label="Pilih berkas untuk diunggah" />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <UploadCloud className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-medium">
          {isDragActive ? "Lepaskan berkas di sini" : "Tarik & lepas berkas di sini"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          atau{" "}
          <button
            type="button"
            onClick={open}
            className="font-medium text-primary underline-offset-4 hover:underline"
            disabled={disabled}
          >
            pilih dari perangkat
          </button>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {accept} · maks. {maxFiles} berkas · {maxSizeMb} MB per berkas
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Berkas yang dipilih">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <File className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)} · {extensionOf(file.name).toUpperCase()}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFile(index)}
                aria-label={`Hapus ${file.name}`}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
