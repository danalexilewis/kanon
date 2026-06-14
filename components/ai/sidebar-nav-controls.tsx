'use client'

import type { ComponentProps, ReactNode } from 'react'
import { MessageCircleIcon, Search } from 'lucide-react'
import { useI18n } from 'fumadocs-ui/contexts/i18n'
import { useSearchContext } from 'fumadocs-ui/contexts/search'
import { SidebarTabsDropdown } from 'fumadocs-ui/components/sidebar/tabs/dropdown'
import type { SidebarTab } from 'fumadocs-ui/utils/get-sidebar-tabs'
import { cn } from '@/lib/cn'
import { useAISearchContext } from '@/components/ai/search'

const actionClassName =
  'inline-flex w-full min-w-0 items-center gap-2 rounded-lg border bg-fd-secondary/50 p-1.5 ps-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground'

function ShortcutKeys({ children }: { children: ReactNode }) {
  return <div className="ms-auto inline-flex shrink-0 gap-0.5">{children}</div>
}

function ShortcutKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border bg-fd-background px-1.5 text-[10px] font-medium">
      {children}
    </kbd>
  )
}

type SidebarNavControlsProps = ComponentProps<'div'> & {
  tabs: SidebarTab[]
  /** Whether to render the AI chat trigger. False for anonymous visitors. */
  showChat?: boolean
}

/** Sidebar column: tab switcher, then search, then chat. */
export function SidebarNavControls({
  tabs,
  showChat = true,
  className,
  ...props
}: SidebarNavControlsProps) {
  const { enabled, hotKey, setOpenSearch } = useSearchContext()
  const { setOpen: setOpenChat, hasBackgroundActivity } = useAISearchContext()
  const { text } = useI18n()

  if (!enabled && tabs.length === 0 && !showChat) return null;

  return (
    <div {...props} className={cn('flex w-full flex-col gap-2', className)}>
      {tabs.length > 0 ? <SidebarTabsDropdown options={tabs} className="w-full" /> : null}
      {enabled ? (
        <button
          type="button"
          data-search-full=""
          className={actionClassName}
          onClick={() => setOpenSearch(true)}
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">{text.search}</span>
          <ShortcutKeys>
            {hotKey.map((key, index) => (
              <ShortcutKey key={index}>{key.display}</ShortcutKey>
            ))}
          </ShortcutKeys>
        </button>
      ) : null}
      {showChat ? (
        <button
          type="button"
          className={cn(actionClassName, 'relative')}
          aria-label="Open Chat to Docs"
          onClick={() => setOpenChat(true)}
        >
          <MessageCircleIcon className="size-4 shrink-0" />
          <span className="truncate">Chat to Docs</span>
          {hasBackgroundActivity ? (
            <span className="absolute end-2 top-2 size-2 rounded-full bg-fd-primary" aria-hidden />
          ) : null}
          <ShortcutKeys>
            <ShortcutKey>
              <span className="text-xs">⌘</span>/
            </ShortcutKey>
          </ShortcutKeys>
        </button>
      ) : null}
    </div>
  )
}
