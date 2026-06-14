"use client";

import type { ReactNode } from "react";
import { AISearch } from "@/components/ai/search";

export function FumadocsProviders({ children }: { children: ReactNode }) {
  return <AISearch>{children}</AISearch>;
}
