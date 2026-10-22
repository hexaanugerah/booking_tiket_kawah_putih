import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { TOOL_ICONS } from "@/lib/tools";
import { cn } from "@/lib/utils";
import type { Tool } from "@/types";

export function ToolCard({ tool, compact = false }: { tool: Tool; compact?: boolean }) {
  const Icon = TOOL_ICONS[tool.id] ?? TOOL_ICONS["pdf-to-word"];
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary",
            !tool.available && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {tool.available ? (
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        ) : (
          <Badge variant="muted"><Lock className="h-3 w-3" /> Tidak tersedia</Badge>
        )}
      </div>
      <h3 className="mt-3 font-semibold leading-snug">{tool.label}</h3>
      <p className={cn("mt-1 text-sm text-muted-foreground", compact ? "line-clamp-2" : "line-clamp-3")}>
        {tool.description}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {tool.inputs.slice(0, 3).map((extension) => (
          <span key={extension} className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {extension.replace(".", "").toUpperCase()}
          </span>
        ))}
        <span className="text-[11px] text-muted-foreground">→</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
          {tool.output.toUpperCase()}
        </span>
      </div>
      {!tool.available && tool.unavailable_reason && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{tool.unavailable_reason}</p>
      )}
    </>
  );

  if (!tool.available) {
    return (
      <div
        className="group rounded-xl border border-dashed bg-card/50 p-5 opacity-80"
        aria-disabled="true"
        title={tool.unavailable_reason ?? "Alat tidak tersedia"}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/convert/${tool.id}`}
      className="group rounded-xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </Link>
  );
}
