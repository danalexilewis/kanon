'use client'

import type { ComponentProps } from 'react'
import { Loader2, MessageCircleIcon, Trash2 } from 'lucide-react'
import { buttonVariants } from 'fumadocs-ui/components/ui/button'
import { cn } from '@/lib/cn'
import { IconButtonTooltip } from '@/components/ui/icon-button-tooltip'
import { formatRelativeTime, getChatTitle, type StoredChat } from '@/lib/chat-history'

type ChatHistoryListProps = ComponentProps<'div'> & {
  chats: StoredChat[]
  currentChatId: string
  unreadIds: Set<string>
  runningIds: Set<string>
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
}

/** Locally stored chat sessions, sorted by last interaction. */
export function ChatHistoryList({
  chats,
  currentChatId,
  unreadIds,
  runningIds,
  onSelectChat,
  onDeleteChat,
  className,
  ...props
}: ChatHistoryListProps) {
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)

  if (sortedChats.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-2 px-3 py-8 text-center text-sm text-fd-muted-foreground/80',
          className,
        )}
        {...props}
      >
        <MessageCircleIcon className="size-5" />
        <p>No saved chats yet. Start a conversation to build your history.</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'fd-scroll-container flex-1 overflow-y-auto overscroll-contain py-2',
        className,
      )}
      {...props}
    >
      <ul className="flex flex-col gap-1 px-1">
        {sortedChats.map((chat) => {
          const isActive = chat.id === currentChatId
          const isRunning = runningIds.has(chat.id)
          const isUnread = unreadIds.has(chat.id)

          return (
            <li key={chat.id}>
              <div
                className={cn(
                  'group flex items-center gap-1 rounded-lg border border-transparent transition-colors',
                  isActive && 'border-fd-border bg-fd-secondary/70',
                  !isActive && 'hover:border-fd-border/60 hover:bg-fd-secondary/40',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 px-3 py-2.5 text-start"
                  onClick={() => onSelectChat(chat.id)}
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {getChatTitle(chat)}
                    </p>
                    {isRunning ? (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-fd-muted-foreground"
                        aria-label="Generating"
                      />
                    ) : null}
                    {!isRunning && isUnread ? (
                      <span
                        className="size-2 shrink-0 rounded-full bg-fd-primary"
                        aria-label="Unread reply"
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-fd-muted-foreground">
                    {formatRelativeTime(chat.updatedAt)}
                  </p>
                </button>
                <IconButtonTooltip label={`Delete ${getChatTitle(chat)}`}>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({
                        color: 'ghost',
                        size: 'icon-sm',
                        className:
                          'me-1 shrink-0 rounded-md text-fd-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-fd-error focus-visible:opacity-100',
                      }),
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteChat(chat.id)
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </IconButtonTooltip>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
