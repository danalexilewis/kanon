import type { Metadata, Viewport } from "next";
import { RootProvider } from 'fumadocs-ui/provider';
import './globals.css';
import { SerwistProvider } from "@/app/serwist";

const APP_NAME = "Kanon Knowledge Base";
const APP_DEFAULT_TITLE = "Kanon Knowledge Base";
const APP_TITLE_TEMPLATE = "%s - Kanon KB";
const APP_DESCRIPTION = "Knowledge base from ingest, served with Fumadocs.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#6366F1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>
          <SerwistProvider swUrl="/serwist/sw.js">
            {children}
          </SerwistProvider>
        </RootProvider>
      </body>
    </html>
  );
}
