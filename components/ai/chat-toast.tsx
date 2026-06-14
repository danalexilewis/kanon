'use client'

import type { ComponentProps } from 'react'
import { Check, MessageCircleIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ChatToastPayload =
  | {
      kind: 'thread'
      id: string
      title: string
    }
  | {
      kind: 'notice'
      heading: string
      detail?: string
    }

type ChatToastProps = ComponentProps<'button'> & {
  toast: ChatToastPayload
}

/** Transient notification — background thread replies or short-lived notices. */
export function ChatToast({ toast, className, onClick, ...props }: ChatToastProps) {
  const isThread = toast.kind === 'thread'
  const Icon = isThread ? MessageCircleIcon : Check

  return (
    <button
      type="button"
      aria-live="polite"
      className={cn(
        'fixed z-50 flex max-w-sm items-center gap-2 rounded-xl border border-fd-border bg-fd-card px-3 py-2.5 text-start text-sm shadow-lg',
        'inset-x-3 top-4 sm:inset-x-auto sm:end-4 sm:top-6',
        'animate-fd-dialog-in transition-opacity hover:bg-fd-accent/30',
        className,
      )}
      onClick={onClick}
      {...props}
    >
      <Icon className="size-4 shrink-0 text-fd-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fd-foreground">
          {isThread ? 'Reply ready' : toast.heading}
        </span>
        {isThread ? (
          <span className="mt-0.5 block truncate text-fd-muted-foreground">{toast.title}</span>
        ) : toast.detail ? (
          <span className="mt-0.5 block truncate text-fd-muted-foreground">{toast.detail}</span>
        ) : null}
      </span>
    </button>
  )
}
