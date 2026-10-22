import {
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Image,
  Languages,
  Presentation,
  ScanText,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ToolCategory } from "@/types";

export const CATEGORY_META: Record<
  ToolCategory,
  { label: string; description: string; icon: LucideIcon }
> = {
  pdf: {
    label: "PDF",
    description: "Konversi, gabungkan, pisahkan, dan olah halaman PDF.",
    icon: FileText,
  },
  word: {
    label: "Word",
    description: "DOCX ke PDF, teks, HTML, Markdown, dan sebaliknya.",
    icon: FileType2,
  },
  excel: {
    label: "Excel",
    description: "Lembar kerja ke PDF, CSV, HTML, dan tabel PDF ke Excel.",
    icon: FileSpreadsheet,
  },
  powerpoint: {
    label: "PowerPoint",
    description: "Presentasi ke PDF atau gambar slide.",
    icon: Presentation,
  },
  image: {
    label: "Gambar & OCR",
    description: "Format gambar, ke PDF, dan ekstraksi teks dengan OCR.",
    icon: Image,
  },
  text: {
    label: "Teks & Web",
    description: "HTML, Markdown, dan teks biasa menjadi PDF.",
    icon: FileText,
  },
};

export const TOOL_ICONS: Record<string, LucideIcon> = {
  "pdf-to-word": FileType2,
  "pdf-to-excel": FileSpreadsheet,
  "pdf-to-pptx": Presentation,
  "pdf-to-images": FileImage,
  "image-to-pdf": FileImage,
  "merge-pdf": Sparkles,
  "split-pdf": FileText,
  "rotate-pdf": FileText,
  "compress-pdf": FileText,
  "extract-text": FileText,
  "extract-tables": FileSpreadsheet,
  "add-page-numbers": FileText,
  "add-watermark": FileText,
  "remove-pages": FileText,
  "reorder-pdf": FileText,
  "docx-to-pdf": FileText,
  "docx-to-txt": FileText,
  "docx-to-html": FileText,
  "docx-to-markdown": FileText,
  "txt-to-docx": FileType2,
  "markdown-to-docx": FileType2,
  "merge-docx": Sparkles,
  "clean-docx": Sparkles,
  "xlsx-to-pdf": FileText,
  "xlsx-to-csv": FileSpreadsheet,
  "csv-to-xlsx": FileSpreadsheet,
  "xlsx-to-html": FileSpreadsheet,
  "pptx-to-pdf": FileText,
  "pptx-to-images": FileImage,
  "convert-image": Image,
  "image-ocr": ScanText,
  "pdf-ocr-to-word": Languages,
  "html-to-pdf": FileText,
  "txt-to-pdf": FileText,
  "markdown-to-pdf": FileText,
};

export const POPULAR_TOOL_IDS = [
  "pdf-to-word",
  "docx-to-pdf",
  "pdf-to-excel",
  "image-to-pdf",
  "merge-pdf",
  "image-ocr",
];
