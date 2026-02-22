"use client";

import React, { useState } from "react";

const icons = {
  info: (
    <svg className="size-5 shrink-0 fill-blue-500 text-card" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  ),
  warn: (
    <svg className="size-5 shrink-0 fill-amber-500 text-card" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  ),
  error: (
    <svg className="size-5 shrink-0 fill-red-500 text-card" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v2z" />
    </svg>
  ),
  success: (
    <svg className="size-5 shrink-0 fill-emerald-500 text-card" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  ),
  idea: (
    <svg className="size-5 shrink-0 fill-violet-500 text-card" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
    </svg>
  ),
};

type CalloutType = "info" | "warn" | "warning" | "error" | "success" | "idea";

interface CollapsibleCalloutProps {
  type?: CalloutType;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function CollapsibleCallout({
  type = "info",
  title,
  icon,
  defaultOpen = false,
  className,
  children,
  ...props
}: CollapsibleCalloutProps & Omit<React.HTMLAttributes<HTMLDivElement>, "title">) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const effectiveType = type === "warning" ? "warn" : type ?? "info";
  const Icon = icon ?? icons[effectiveType as keyof typeof icons];
  const defaultLabels: Record<string, string> = {
    info: "Note",
    warn: "Warning",
    error: "Error",
    success: "Success",
    idea: "Idea",
  };
  const label = title ?? defaultLabels[effectiveType] ?? "Note";

  return (
    <div
      className={`my-3 rounded-lg border bg-card text-sm text-muted-foreground shadow-md overflow-hidden${className ? ` ${className}` : ""}`}
      {...props}
    >
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="fd-collapsible-callout-trigger flex w-full cursor-pointer flex-row items-center gap-2 rounded-lg p-3 text-left transition-[background] hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={isOpen}
      >
        {Icon}
        <span className="min-w-0 flex-1 font-medium text-card-foreground truncate">{label}</span>
        <svg
          className={`size-5 shrink-0 transition-transform text-muted-foreground${isOpen ? " rotate-180" : ""}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="prose-no-margin border-t border-border/50 px-3 pt-2 pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
