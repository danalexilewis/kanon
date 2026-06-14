import { notFound } from "next/navigation";
import type { ReactNode } from "react";

type DevLayoutProps = {
  children: ReactNode;
};

/** Dev-only layout — routes under /dev are unavailable in production. */
export default function DevLayout({ children }: DevLayoutProps) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <>{children}</>;
}
