import { DocsLayout } from 'fumadocs-ui/layout';
import { source } from '@/lib/source';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree() as any}
      nav={{ title: 'Kanon' }}
    >
      {children}
    </DocsLayout>
  );
}
