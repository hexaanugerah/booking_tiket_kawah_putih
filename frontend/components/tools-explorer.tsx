"use client";

import { AlertTriangle, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { ToolCard } from "@/components/tool-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getFormats } from "@/services/formats";
import { useQuery } from "@tanstack/react-query";

export function ToolsExplorer() {
  const formatsQuery = useQuery({ queryKey: ["formats"], queryFn: getFormats, staleTime: 60_000 });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const tools = formatsQuery.data?.tools ?? [];
  const categories = formatsQuery.data?.categories ?? [];

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return tools.filter((tool) => {
      if (category !== "all" && tool.category !== category) return false;
      if (onlyAvailable && !tool.available) return false;
      if (!search) return true;
      return (
        tool.label.toLowerCase().includes(search) ||
        tool.description.toLowerCase().includes(search) ||
        tool.inputs.some((extension) => extension.includes(search)) ||
        tool.output.toLowerCase().includes(search)
      );
    });
  }, [tools, query, category, onlyAvailable]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof tools>();
    for (const tool of filtered) {
      map.set(tool.category, [...(map.get(tool.category) ?? []), tool]);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari alat, format, atau kata kunci…"
            className="pl-9"
            aria-label="Cari alat konversi"
          />
        </div>
        <Button
          type="button"
          variant={onlyAvailable ? "default" : "outline"}
          onClick={() => setOnlyAvailable((value) => !value)}
          className="shrink-0"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {onlyAvailable ? "Hanya yang tersedia" : "Tampilkan semua"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            category === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
          )}
        >
          Semua
        </button>
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(item.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              category === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {formatsQuery.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      )}

      {formatsQuery.isError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="font-medium">Daftar alat tidak dapat dimuat</p>
            <p className="text-muted-foreground">{(formatsQuery.error as Error).message}</p>
          </div>
        </div>
      )}

      {!formatsQuery.isLoading && !formatsQuery.isError && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">Tidak ada alat yang cocok</p>
          <p className="mt-1 text-sm text-muted-foreground">Coba kata kunci atau kategori lain.</p>
          <Button variant="outline" className="mt-4" onClick={() => { setQuery(""); setCategory("all"); setOnlyAvailable(false); }}>
            Reset filter
          </Button>
        </div>
      )}

      {[...grouped.entries()].map(([categoryId, categoryTools]) => {
        const meta = categories.find((item) => item.id === categoryId);
        return (
          <section key={categoryId} aria-labelledby={`category-${categoryId}`}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id={`category-${categoryId}`} className="text-lg font-semibold">
                {meta?.label ?? categoryId}
              </h2>
              <span className="text-xs text-muted-foreground">{categoryTools.length} alat</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoryTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} compact />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
