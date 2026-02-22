export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">You are offline.</h1>
      <p className="mt-2 text-muted-foreground">
        This page is cached and available for offline use.
      </p>
      <p className="mt-2 text-muted-foreground">
        Please check your network connection to access new content.
      </p>
    </main>
  );
}
