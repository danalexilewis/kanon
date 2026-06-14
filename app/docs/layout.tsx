import { DocsLayoutWithChat } from "@/components/docs-layout-with-chat";
import { source } from "@/lib/source";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayoutWithChat
      tree={source.getPageTree() as any}
      nav={{ title: "Kanon" }}
    >
      {children}
    </DocsLayoutWithChat>
  );
}
