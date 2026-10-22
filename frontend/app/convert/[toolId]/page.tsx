import type { Metadata } from "next";

import { Converter } from "@/components/converter";

interface PageProps {
  params: Promise<{ toolId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { toolId } = await params;
  const label = toolId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return { title: label };
}

export default async function ConvertToolPage({ params }: PageProps) {
  const { toolId } = await params;
  return <Converter toolId={toolId} />;
}
