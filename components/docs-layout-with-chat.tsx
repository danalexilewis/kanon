"use client";

import { AISearchPanel } from "@/components/ai/search";
import { SidebarNavControls } from "@/components/ai/sidebar-nav-controls";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";

export function DocsLayoutWithChat({
  children,
  sidebar,
  ...props
}: DocsLayoutProps) {
  return (
    <DocsLayout
      {...props}
      sidebar={{
        ...sidebar,
        banner: (
          <div className="md:hidden">
            <SidebarNavControls tabs={[]} />
          </div>
        ),
      }}
      searchToggle={{
        components: {
          lg: (
            <div className="max-md:hidden">
              <SidebarNavControls tabs={[]} />
            </div>
          ),
        },
      }}
    >
      {children}
      <AISearchPanel />
    </DocsLayout>
  );
}
