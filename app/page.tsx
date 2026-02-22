import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">Kanon</h1>
      <p className="mt-2 text-muted-foreground">
        Knowledge base from ingest → ontology, served with Fumadocs.
      </p>
      <Link
        href="/docs"
        className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
      >
        Open knowledge base →
      </Link>
    </main>
  );
}
