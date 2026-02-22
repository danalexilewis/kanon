"use client";

import React, { useState } from 'react';

interface CollapsibleProps {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Collapsible({ title, defaultOpen = false, children }: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="fd-collapsible my-3 rounded-lg border bg-card text-card-foreground shadow overflow-hidden">
      <button
        type="button"
        className="fd-collapsible-header flex w-full cursor-pointer items-center justify-between gap-2 p-3 text-left transition-[background] hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="min-w-0 flex-1 font-semibold truncate">{title}</span>
        <svg
          className={`size-5 shrink-0 transition-transform text-muted-foreground${isOpen ? ' rotate-180' : ''}`}
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
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="fd-collapsible-content border-t border-border/50 px-3 pt-2 pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
