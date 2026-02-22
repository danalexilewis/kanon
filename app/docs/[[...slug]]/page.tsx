import { source } from '@/lib/source';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page == null) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc as any}>
      <DocsBody>
        <h1 className="mb-4 text-3xl font-bold">{page.data.title}</h1>
        {page.data.description && (
          <p className="text-fd-muted-foreground mb-6">{page.data.description}</p>
        )}
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page == null) return {};
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
