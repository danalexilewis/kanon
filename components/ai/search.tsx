'use client'

import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type SyntheticEvent,
  use,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
  History,
  Loader2,
  MessageCircleIcon,
  SearchIcon,
  Send,
  SquarePen,
  X,
} from 'lucide-react'
import { Chat, useChat, type UseChatHelpers } from '@ai-sdk/react'
import { DefaultChatTransport, type Tool, type UIToolInvocation } from 'ai'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import Link from 'fumadocs-core/link'
import { buttonVariants } from 'fumadocs-ui/components/ui/button'
import { cn } from '@/lib/cn'
import { IconButtonTooltip } from '@/components/ui/icon-button-tooltip'
import { assembleContextPack, extractThreadContext } from '@/lib/build-context'
import type { ChatDocument, SearchTool, SuggestFollowupsTool } from '@/lib/openrouter-chat'
import {
  CHAT_IDLE_PLACEHOLDERS,
  CHAT_LOADING_PLACEHOLDER,
  getChatFlow,
  type ChatFlowId,
} from '@/lib/chat-flows'
import { type ChatUIMessage, getMessageFlowId } from '@/lib/chat-types'
import {
  deleteChat as deleteStoredChat,
  extractTitleFromMessages,
  fallbackTitleFromMessages,
  getChatTitle,
  loadChats,
  newChatId,
  type StoredChat,
  upsertChat,
} from '@/lib/chat-history'
import { ChatHistoryList } from '@/components/ai/chat-history'
import { ChatToast, type ChatToastPayload } from '@/components/ai/chat-toast'
import { ChatFlowPicker } from '@/components/ai/chat-flow-picker'
import { ChatMarkdown } from '@/components/ai/markdown'

type ChatView = 'chat' | 'history'

const PERSIST_DEBOUNCE_MS = 500
const TOAST_DURATION_MS = 3000

function isThreadRunning(status: string) {
  return status === 'streaming' || status === 'submitted'
}

function hasBackgroundActivity(unreadIds: Set<string>, runningIds: Set<string>, currentId: string) {
  for (const id of unreadIds) {
    if (id !== currentId) return true
  }
  for (const id of runningIds) {
    if (id !== currentId) return true
  }
  return false
}

function hasHistoryUnread(unreadIds: Set<string>, currentId: string) {
  for (const id of unreadIds) {
    if (id !== currentId) return true
  }
  return false
}

const Context = createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  view: ChatView
  setView: (view: ChatView) => void
  chats: StoredChat[]
  currentChatId: string
  newChat: () => void
  selectChat: (id: string) => void
  deleteChat: (id: string) => void
  activeFlowId: ChatFlowId | null
  setActiveFlowId: (flowId: ChatFlowId | null) => void
  requestInputFocus: () => void
  focusInputNonce: number
  unreadIds: Set<string>
  runningIds: Set<string>
  unreadCount: number
  hasBackgroundActivity: boolean
  toast: ChatToastPayload | null
  dismissToast: () => void
  showNoticeToast: (heading: string, detail?: string) => void
  chat: UseChatHelpers<ChatUIMessage>
} | null>(null)

function focusChatInput() {
  window.requestAnimationFrame(() => {
    document.getElementById('nd-ai-input')?.focus()
  })
}

const CHAT_PLACEHOLDER_INTERVAL_MS = 4000

function useRotatingChatPlaceholder(active: boolean) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!active) return

    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % CHAT_IDLE_PLACEHOLDERS.length)
    }, CHAT_PLACEHOLDER_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [active])

  return CHAT_IDLE_PLACEHOLDERS[index]
}

type ChatSource = {
  url: string
  title: string
}

function extractSourcesFromSearchCalls(calls: UIToolInvocation<SearchTool>[]): ChatSource[] {
  const seen = new Set<string>()
  const sources: ChatSource[] = []

  for (const call of calls) {
    if (!call.output || !Array.isArray(call.output)) continue

    for (const item of call.output) {
      const doc = (item as { doc?: ChatDocument })?.doc
      if (!doc?.url || seen.has(doc.url)) continue
      seen.add(doc.url)
      sources.push({ url: doc.url, title: doc.title || doc.url })
    }
  }

  return sources
}

function extractFollowups(message: ChatUIMessage): string[] {
  for (const part of message.parts ?? []) {
    if (part.type !== 'tool-suggestFollowups') continue

    const invocation = part as UIToolInvocation<SuggestFollowupsTool>

    if (invocation.state === 'output-available' && Array.isArray(invocation.output)) {
      return invocation.output.filter((q): q is string => typeof q === 'string' && q.length > 0)
    }

    const input = invocation.input as { questions?: string[] } | undefined
    if (input?.questions?.length) {
      return input.questions.filter((q) => q.length > 0)
    }
  }

  return []
}

const chatHeaderActionClassName = 'rounded-full p-1.5 text-fd-muted-foreground [&_svg]:size-4.5'

type BuildContextStatus = 'idle' | 'building' | 'done' | 'error'

async function copyContextPackToClipboard(pack: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard unavailable')
  }

  await navigator.clipboard.writeText(pack)
}

export function AISearchPanelHeader({ className, ...props }: ComponentProps<'div'>) {
  const {
    setOpen,
    view,
    setView,
    newChat,
    requestInputFocus,
    unreadIds,
    currentChatId,
    chat,
    chats,
    showNoticeToast,
  } = useAISearchContext()
  const showHistoryUnread = hasHistoryUnread(unreadIds, currentChatId)
  const [buildContextStatus, setBuildContextStatus] = useState<BuildContextStatus>('idle')
  const hasMessages = chat.messages.length > 0
  const isBuildingContext = buildContextStatus === 'building'

  useEffect(() => {
    if (buildContextStatus !== 'done' && buildContextStatus !== 'error') return

    const timeout = window.setTimeout(() => {
      setBuildContextStatus('idle')
    }, 2000)

    return () => window.clearTimeout(timeout)
  }, [buildContextStatus])

  function resolveChatTitle() {
    const stored = chats.find((item) => item.id === currentChatId)
    if (stored) return getChatTitle(stored)
    return fallbackTitleFromMessages(chat.messages)
  }

  async function buildContext() {
    if (!hasMessages || isBuildingContext) return

    setBuildContextStatus('building')

    const { transcript, sources } = extractThreadContext(chat.messages)
    const title = resolveChatTitle()

    let summary = ''
    try {
      const response = await fetch('/api/build-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })

      if (response.ok) {
        const data = (await response.json()) as { summary?: string }
        summary = typeof data.summary === 'string' ? data.summary : ''
      }
    } catch {
      summary = ''
    }

    const pack = assembleContextPack({
      title,
      summary,
      transcript,
      sources,
    })

    try {
      await copyContextPackToClipboard(pack)
      setBuildContextStatus('done')
      showNoticeToast('Context copied to clipboard', title)
    } catch {
      setBuildContextStatus('error')
      showNoticeToast('Could not copy context', 'Check clipboard permissions and try again')
    }
  }

  function toggleHistory() {
    if (view === 'history') {
      setView('chat')
      requestInputFocus()
      return
    }

    setView('history')
  }

  const showBuildContextTooltip = buildContextStatus === 'idle' || buildContextStatus === 'building'

  const buildContextLabel =
    buildContextStatus === 'building' ? 'Building context…' : 'Copy context to clipboard'

  const buildContextButton = (
    <button
      type="button"
      tabIndex={-1}
      disabled={!hasMessages || isBuildingContext}
      aria-label={buildContextLabel}
      className={cn(
        buttonVariants({ color: 'ghost', className: chatHeaderActionClassName }),
        buildContextStatus === 'done' && 'text-fd-primary',
        buildContextStatus === 'error' && 'text-fd-destructive',
      )}
      onClick={() => void buildContext()}
    >
      {isBuildingContext ? (
        <Loader2 className="animate-spin" />
      ) : buildContextStatus === 'done' ? (
        <Check />
      ) : (
        <ClipboardCopy />
      )}
    </button>
  )

  return (
    <div
      className={cn(
        'sticky top-0 flex items-start gap-2 rounded-xl border bg-fd-secondary text-fd-secondary-foreground shadow-sm',
        className,
      )}
      {...props}
    >
      <div className="flex-1 px-3 py-2">
        <p className="text-base font-medium">
          {view === 'history' ? 'Chat history' : 'Chat to Docs'}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-0.5 pe-1 pt-1">
        {view === 'chat' ? (
          <>
            {showBuildContextTooltip ? (
              <IconButtonTooltip label={buildContextLabel} side="bottom">
                {buildContextButton}
              </IconButtonTooltip>
            ) : (
              buildContextButton
            )}
            <IconButtonTooltip label="New chat" side="bottom">
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  buttonVariants({ color: 'ghost', className: chatHeaderActionClassName }),
                )}
                onClick={newChat}
              >
                <SquarePen />
              </button>
            </IconButtonTooltip>
          </>
        ) : null}
        <IconButtonTooltip
          label={view === 'history' ? 'Back to chat' : 'Open chat history'}
          side="bottom"
        >
          <button
            aria-pressed={view === 'history'}
            type="button"
            tabIndex={-1}
            className={cn(
              buttonVariants({ color: 'ghost', className: chatHeaderActionClassName }),
              'relative',
              view === 'history' && 'bg-fd-accent text-fd-accent-foreground',
            )}
            onClick={toggleHistory}
          >
            <History />
            {showHistoryUnread ? (
              <span
                className="absolute end-1 top-1 size-2 rounded-full bg-fd-primary"
                aria-hidden
              />
            ) : null}
          </button>
        </IconButtonTooltip>
        <IconButtonTooltip label="Close chat" side="bottom">
          <button
            type="button"
            tabIndex={-1}
            className={cn(buttonVariants({ color: 'ghost', className: chatHeaderActionClassName }))}
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </IconButtonTooltip>
      </div>
    </div>
  )
}

const StorageKeyInput = '__ai_search_input'

export function AISearchInput(props: ComponentProps<'form'>) {
  const { status, sendMessage, stop } = useChatContext()
  const { activeFlowId, setActiveFlowId, view, open, focusInputNonce, requestInputFocus } =
    useAISearchContext()
  const [input, setInput] = useState(() => localStorage.getItem(StorageKeyInput) ?? '')
  const isLoading = status === 'streaming' || status === 'submitted'
  const activeFlow = activeFlowId ? getChatFlow(activeFlowId) : null
  const idlePlaceholder = useRotatingChatPlaceholder(
    open && view === 'chat' && !activeFlowId && !isLoading,
  )
  const trimmedInput = input.trim()
  const canSubmit = trimmedInput.length > 0 || (activeFlow?.allowsEmptyPrompt && !isLoading)

  useEffect(() => {
    if (!open || view !== 'chat') return

    focusChatInput()
  }, [open, view, focusInputNonce])

  function handleSelectFlow(flowId: ChatFlowId | null) {
    setActiveFlowId(flowId)
    requestInputFocus()
  }

  function onStart(e?: SyntheticEvent) {
    e?.preventDefault()
    if (!canSubmit) return

    const text = trimmedInput.length > 0 ? input : (activeFlow?.defaultPrompt ?? '')

    if (!text.trim()) return

    void sendMessage({
      text,
      metadata: activeFlowId ? { flowId: activeFlowId } : undefined,
    })
    setInput('')
    localStorage.removeItem(StorageKeyInput)
  }

  useEffect(() => {
    if (isLoading) document.getElementById('nd-ai-input')?.focus()
  }, [isLoading])

  return (
    <form {...props} className={cn('flex flex-col', props.className)} onSubmit={onStart}>
      <ChatFlowPicker
        activeFlowId={activeFlowId}
        onSelectFlow={handleSelectFlow}
        disabled={isLoading}
      />
      <div className="flex items-end gap-2 p-2">
        <Input
          value={input}
          placeholder={
            isLoading ? CHAT_LOADING_PLACEHOLDER : (activeFlow?.placeholder ?? idlePlaceholder)
          }
          rows={3}
          className="min-h-[72px] px-2 py-2 text-base"
          disabled={status === 'streaming' || status === 'submitted'}
          onChange={(e) => {
            setInput(e.target.value)
            localStorage.setItem(StorageKeyInput, e.target.value)
          }}
          onKeyDown={(event) => {
            if (!event.shiftKey && event.key === 'Enter') {
              onStart(event)
            }
          }}
        />
        {isLoading ? (
          <IconButtonTooltip label="Stop generating">
            <button
              type="button"
              className={cn(
                buttonVariants({
                  color: 'secondary',
                  className: 'shrink-0 gap-2 rounded-full transition-all',
                }),
              )}
              onClick={stop}
            >
              <Loader2 className="size-4 animate-spin text-fd-muted-foreground" />
            </button>
          </IconButtonTooltip>
        ) : (
          <IconButtonTooltip label="Send">
            <button
              type="submit"
              className={cn(
                buttonVariants({
                  color: 'primary',
                  className: 'shrink-0 rounded-full transition-all',
                }),
              )}
              disabled={!canSubmit}
            >
              <Send className="size-4" />
            </button>
          </IconButtonTooltip>
        )}
      </div>
    </form>
  )
}

function List(props: Omit<ComponentProps<'div'>, 'dir'>) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    function callback() {
      const container = containerRef.current
      if (!container) return

      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'instant',
      })
    }

    const observer = new ResizeObserver(callback)
    callback()

    const element = containerRef.current?.firstElementChild

    if (element) {
      observer.observe(element)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      {...props}
      className={cn('fd-scroll-container overflow-y-auto min-w-0 flex flex-col', props.className)}
    >
      {props.children}
    </div>
  )
}

function Input(props: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLDivElement>(null)
  const shared = cn('col-start-1 row-start-1', props.className)

  return (
    <div className="grid min-w-0 flex-1">
      <textarea
        id="nd-ai-input"
        {...props}
        className={cn(
          'resize-none bg-transparent text-base placeholder:text-fd-muted-foreground focus-visible:outline-none',
          shared,
        )}
      />
      <div ref={ref} className={cn(shared, 'break-all invisible')}>
        {`${props.value?.toString() ?? ''}\n`}
      </div>
    </div>
  )
}

const roleName = {
  assistant: "assistant",
} as const;

const messageActionClass =
  'inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring'

const messageActionsClass =
  'mt-1 flex items-center opacity-0 transition-opacity group-hover/message:opacity-100 hover:opacity-100 focus-within:opacity-100'

function MessageFlowBadge({ flowId }: { flowId: ChatFlowId }) {
  const flow = getChatFlow(flowId)

  return (
    <span
      title={flow.description}
      className={cn(
        buttonVariants({
          color: 'secondary',
          className: 'pointer-events-none h-auto rounded-full px-2 py-0.5 text-xs font-medium',
        }),
      )}
    >
      {flow.label}
    </span>
  )
}

function CopyMessageButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!text.trim()) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  if (!text.trim()) return null

  const copyLabel = copied ? 'Copied' : 'Copy message'

  return (
    <IconButtonTooltip label={copyLabel}>
      <button
        type="button"
        className={cn(messageActionClass, className)}
        onClick={() => void handleCopy()}
      >
        {copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
    </IconButtonTooltip>
  )
}

function CollapsibleSources({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false)

  if (sources.length === 0) return null

  return (
    <div className="mt-2 border-t border-fd-border/60 pt-2">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md py-1 text-start text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-foreground"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ChevronRight
          className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        <span>Sources · {sources.length}</span>
      </button>
      {open ? (
        <ul className="mt-1.5 flex flex-col gap-1 ps-5">
          {sources.map((source) => (
            <li key={source.url}>
              <Link
                href={source.url}
                className="text-sm text-fd-primary underline-offset-2 hover:underline"
              >
                {source.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Message({
  message,
  showFollowups = false,
  onFollowupClick,
  ...props
}: {
  message: ChatUIMessage
  showFollowups?: boolean
  onFollowupClick?: (question: string) => void
} & ComponentProps<'div'>) {
  let markdown = ''
  const searchCalls: UIToolInvocation<SearchTool>[] = []

  for (const part of message.parts ?? []) {
    if (part.type === 'text') {
      markdown += part.text
      continue
    }

    if (part.type.startsWith('tool-')) {
      const toolName = part.type.slice('tool-'.length)
      const p = part as UIToolInvocation<Tool>

      if (toolName !== 'search' || !p.toolCallId) continue
      searchCalls.push(p as UIToolInvocation<SearchTool>)
    }
  }

  const sources = extractSourcesFromSearchCalls(searchCalls)
  const followups = showFollowups ? extractFollowups(message) : []
  const isSearching = searchCalls.some((call) => !call.output)
  const isUser = message.role === 'user'
  const flowId = isUser ? getMessageFlowId(message) : null

  if (isUser) {
    return (
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-end" {...props}>
        <div className="group/message flex max-w-[88%] flex-col items-end">
          <div className="rounded-2xl border border-fd-border/60 bg-fd-secondary px-3.5 py-2.5 text-base">
            <p className="whitespace-pre-wrap">{markdown}</p>
          </div>
          <div className={cn(messageActionsClass, 'justify-end gap-1.5')}>
            {flowId ? <MessageFlowBadge flowId={flowId} /> : null}
            <CopyMessageButton text={markdown} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-start" {...props}>
      <div className="group/message w-full max-w-full">
        <p className="mb-1.5 text-sm font-medium text-fd-muted-foreground">{roleName.assistant}</p>

        <div className="rounded-xl border border-fd-border px-3.5 py-2.5">
          <div className="prose max-w-none text-base">
            <ChatMarkdown text={markdown} />
          </div>

          {isSearching ? (
            <div className="mt-3 flex flex-row items-center gap-2 rounded-lg border border-fd-border/60 bg-fd-secondary/50 p-2 text-sm text-fd-muted-foreground">
              <SearchIcon className="size-4 shrink-0" />
              <p>Searching docs…</p>
            </div>
          ) : null}

          {sources.length > 0 ? <CollapsibleSources sources={sources} /> : null}
        </div>

        <div className={messageActionsClass}>
          <CopyMessageButton text={markdown} />
        </div>

        {followups.length > 0 && onFollowupClick ? (
          <div className="mt-3">
            <p className="mb-1.5 text-sm font-medium text-fd-muted-foreground">
              Suggested follow-ups
            </p>
            <div className="flex flex-wrap gap-1.5">
              {followups.map((question) => (
                <button
                  key={question}
                  type="button"
                  className={cn(
                    buttonVariants({
                      color: 'secondary',
                      className:
                        'h-auto whitespace-normal rounded-full px-3 py-1.5 text-start text-sm',
                    }),
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onFollowupClick(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ChatPanelInner({ className }: { className?: string }) {
  const { view, chats, currentChatId, selectChat, deleteChat, unreadIds, runningIds } =
    useAISearchContext()

  return (
    <div className={cn('flex size-full min-h-0 flex-col', className)}>
      <AISearchPanelHeader />
      {view === 'history' ? (
        <ChatHistoryList
          className="flex-1"
          chats={chats}
          currentChatId={currentChatId}
          unreadIds={unreadIds}
          runningIds={runningIds}
          onSelectChat={selectChat}
          onDeleteChat={deleteChat}
        />
      ) : (
        <>
          <AISearchPanelList className="flex-1" />
          <div className="shrink-0 rounded-xl border bg-fd-secondary text-fd-secondary-foreground shadow-sm has-focus-visible:shadow-md">
            <AISearchInput />
          </div>
        </>
      )}
      <p className="shrink-0 px-1 pt-2 text-sm text-fd-muted-foreground">
        AI can be inaccurate, please verify the answers.
      </p>
    </div>
  )
}

export function AISearch({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ChatView>('chat')
  const [chats, setChats] = useState<StoredChat[]>([])
  const [currentChatId, setCurrentChatId] = useState(() => newChatId())
  const [activeFlowId, setActiveFlowId] = useState<ChatFlowId | null>(null)
  const [focusInputNonce, setFocusInputNonce] = useState(0)
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set())
  const [runningIds, setRunningIds] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<ChatToastPayload | null>(null)

  const registryRef = useRef(new Map<string, Chat<ChatUIMessage>>())
  const persistTimeoutsRef = useRef(new Map<string, number>())
  const chatsRef = useRef<StoredChat[]>([])
  const currentChatIdRef = useRef(currentChatId)
  const toastTimerRef = useRef<number | null>(null)
  const activeFlowRef = useRef<ChatFlowId | null>(null)

  const transportRef = useRef(
    new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => ({
        body: {
          id,
          messages,
          trigger,
          messageId,
          ...body,
          flowId: activeFlowRef.current,
        },
      }),
    }),
  )

  const requestInputFocus = useEffectEvent(() => {
    setFocusInputNonce((nonce) => nonce + 1)
  })

  const syncRunningStatus = useEffectEvent((threadId: string, status: string) => {
    setRunningIds((prev) => {
      const next = new Set(prev)
      if (isThreadRunning(status)) {
        next.add(threadId)
      } else {
        next.delete(threadId)
      }
      return next
    })
  })

  const dismissToast = useEffectEvent(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setToast(null)
  })

  const showThreadToast = useEffectEvent((threadId: string, messages: ChatUIMessage[]) => {
    const stored = chatsRef.current.find((item) => item.id === threadId)
    const extractedTitle = extractTitleFromMessages(messages)
    const record: StoredChat = {
      id: threadId,
      title: extractedTitle ?? stored?.title ?? null,
      messages,
      createdAt: stored?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToast({ kind: 'thread', id: threadId, title: getChatTitle(record) })
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, TOAST_DURATION_MS)
  })

  const showNoticeToast = useEffectEvent((heading: string, detail?: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToast({ kind: 'notice', heading, detail })
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, TOAST_DURATION_MS)
  })

  const persistThreadMessages = useEffectEvent((threadId: string, messages: ChatUIMessage[]) => {
    if (messages.length === 0) return

    const existingTimeout = persistTimeoutsRef.current.get(threadId)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    const timeout = window.setTimeout(() => {
      persistTimeoutsRef.current.delete(threadId)
      setChats((prev) => {
        const existing = prev.find((item) => item.id === threadId)
        const extractedTitle = extractTitleFromMessages(messages)

        const record: StoredChat = {
          id: threadId,
          title: extractedTitle ?? existing?.title ?? null,
          messages,
          createdAt: existing?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        }

        return upsertChat(record)
      })
    }, PERSIST_DEBOUNCE_MS)

    persistTimeoutsRef.current.set(threadId, timeout)
  })

  const handleThreadFinish = useEffectEvent(
    (
      threadId: string,
      messages: ChatUIMessage[],
      options: { isAbort: boolean; isError: boolean },
    ) => {
      syncRunningStatus(threadId, 'ready')

      if (options.isAbort || options.isError) return

      if (threadId === currentChatIdRef.current) {
        setUnreadIds((prev) => {
          const next = new Set(prev)
          next.delete(threadId)
          return next
        })
        return
      }

      setUnreadIds((prev) => {
        const next = new Set(prev)
        next.add(threadId)
        return next
      })
      showThreadToast(threadId, messages)
    },
  )

  // Plain function: only *registers* callbacks (no effect-event calls during render).
  // The registered callbacks fire at event time, where invoking effect events is allowed.
  function registerThreadCallbacks(threadId: string, instance: Chat<ChatUIMessage>) {
    instance['~registerStatusCallback'](() => {
      syncRunningStatus(threadId, instance.status)
    })

    instance['~registerMessagesCallback'](() => {
      persistThreadMessages(threadId, instance.messages)
    }, PERSIST_DEBOUNCE_MS)
  }

  function getOrCreateThread(id: string): Chat<ChatUIMessage> {
    const existing = registryRef.current.get(id)
    if (existing) return existing

    const stored = chatsRef.current.find((item) => item.id === id)
    const instance = new Chat<ChatUIMessage>({
      id,
      transport: transportRef.current,
      messages: stored?.messages ?? [],
      onFinish: ({ messages, isAbort, isError }) => {
        handleThreadFinish(id, messages, { isAbort, isError })
      },
      onError: () => {
        syncRunningStatus(id, 'error')
      },
    })

    registerThreadCallbacks(id, instance)
    registryRef.current.set(id, instance)
    return instance
  }

  useEffect(() => {
    currentChatIdRef.current = currentChatId
  }, [currentChatId])

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => {
    activeFlowRef.current = activeFlowId
  }, [activeFlowId])

  useEffect(() => {
    if (open && view === 'chat') {
      requestInputFocus()
    }
  }, [open, view])

  useEffect(() => {
    const loaded = loadChats()
    chatsRef.current = loaded
    setChats(loaded)

    if (loaded.length > 0) {
      const mostRecent = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      setCurrentChatId(mostRecent.id)
      currentChatIdRef.current = mostRecent.id
    }
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
      for (const timeout of persistTimeoutsRef.current.values()) {
        window.clearTimeout(timeout)
      }
    }
  }, [])

  const activeThread = getOrCreateThread(currentChatId)
  const chat = useChat<ChatUIMessage>({ chat: activeThread })

  function clearUnread(id: string) {
    setUnreadIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function removeThreadFromRegistry(id: string) {
    const instance = registryRef.current.get(id)
    if (instance) {
      instance.stop()
      registryRef.current.delete(id)
    }

    const persistTimeout = persistTimeoutsRef.current.get(id)
    if (persistTimeout) {
      window.clearTimeout(persistTimeout)
      persistTimeoutsRef.current.delete(id)
    }
  }

  function startNewChat() {
    setCurrentChatId(newChatId())
    setActiveFlowId(null)
    setView('chat')
    requestInputFocus()
  }

  function selectChat(id: string) {
    if (!chats.find((item) => item.id === id)) return
    setCurrentChatId(id)
    clearUnread(id)
    setView('chat')
    requestInputFocus()
  }

  function removeChat(id: string) {
    removeThreadFromRegistry(id)

    setUnreadIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setRunningIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

    if (toast?.kind === 'thread' && toast.id === id) {
      dismissToast()
    }

    const next = deleteStoredChat(id)
    chatsRef.current = next
    setChats(next)

    if (id !== currentChatId) return

    if (next.length > 0) {
      const mostRecent = [...next].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      setCurrentChatId(mostRecent.id)
      return
    }

    setCurrentChatId(newChatId())
  }

  const unreadCount = unreadIds.size
  const backgroundActivity = hasBackgroundActivity(unreadIds, runningIds, currentChatId)

  const contextValue = useMemo(
    () => ({
      chat,
      open,
      setOpen,
      view,
      setView,
      chats,
      currentChatId,
      newChat: startNewChat,
      selectChat,
      deleteChat: removeChat,
      activeFlowId,
      setActiveFlowId,
      requestInputFocus,
      focusInputNonce,
      unreadIds,
      runningIds,
      unreadCount,
      hasBackgroundActivity: backgroundActivity,
      toast,
      dismissToast,
      showNoticeToast,
    }),
    [
      chat,
      open,
      view,
      chats,
      currentChatId,
      activeFlowId,
      focusInputNonce,
      unreadIds,
      runningIds,
      unreadCount,
      backgroundActivity,
      toast,
    ],
  )

  return <Context value={contextValue}>{children}</Context>
}

export function AISearchTrigger({
  position = 'default',
  className,
  ...props
}: ComponentProps<'button'> & { position?: 'default' | 'float' }) {
  const { open, setOpen } = useAISearchContext()

  const triggerLabel = open ? 'Close Chat to Docs' : 'Open Chat to Docs'

  return (
    <IconButtonTooltip label={triggerLabel}>
      <button
        type="button"
        aria-expanded={open}
        data-state={open ? 'open' : 'closed'}
        className={cn(
          position === 'float' && [
            'fixed bottom-4 z-20 flex items-center gap-2 shadow-lg transition-transform',
            'inset-e-[calc(var(--spacing)*4+var(--removed-body-scroll-bar-size,0px))]',
          ],
          className,
        )}
        onClick={() => setOpen(!open)}
        {...props}
      >
        {props.children}
      </button>
    </IconButtonTooltip>
  )
}

function AISearchDialog() {
  const { open, setOpen } = useAISearchContext()

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md data-[state=closed]:animate-fd-fade-out data-[state=open]:animate-fd-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            focusChatInput()
          }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border border-fd-border bg-fd-card text-fd-card-foreground shadow-2xl',
            'focus-visible:outline-none',
            'inset-4 rounded-2xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(85vh,720px)] sm:w-[min(92vw,42rem)] sm:-translate-x-1/2 sm:-translate-y-1/2',
            'data-[state=closed]:animate-fd-dialog-out data-[state=open]:animate-fd-dialog-in',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Chat to Docs</DialogPrimitive.Title>
          <div className="flex min-h-0 flex-1 flex-col p-2 lg:p-3">
            <ChatPanelInner />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function AISearchToast() {
  const { toast, selectChat, setOpen, dismissToast } = useAISearchContext()

  if (!toast) return null

  const activeToast = toast

  function handleClick() {
    if (activeToast.kind === 'thread') {
      selectChat(activeToast.id)
      setOpen(true)
    }

    dismissToast()
  }

  return <ChatToast toast={activeToast} onClick={handleClick} />
}

export function AISearchPanel() {
  useHotKey()

  return (
    <>
      <AISearchToast />
      <AISearchDialog />
    </>
  )
}

export function AISearchPanelList({ className, style, ...props }: ComponentProps<'div'>) {
  const chat = useChatContext()
  const { requestInputFocus } = useAISearchContext()
  const messages = chat.messages.filter((msg) => msg.role !== 'system')
  const isLoading = chat.status === 'streaming' || chat.status === 'submitted'
  const lastAssistantId = [...messages].reverse().find((msg) => msg.role === 'assistant')?.id

  return (
    <List
      className={cn('py-4 overscroll-contain', className)}
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent, white 1rem, white calc(100% - 1rem), transparent 100%)',
        ...style,
      }}
      {...props}
    >
      {messages.length === 0 ? (
        <div className="text-base text-fd-muted-foreground/80 size-full flex flex-col items-center justify-center text-center gap-2">
          <MessageCircleIcon className="size-8" fill="currentColor" stroke="none" />
          <p onClick={(e) => e.stopPropagation()}>Start a new chat below.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 px-3">
          {messages.map((item) => (
            <Message
              key={item.id}
              message={item}
              showFollowups={!isLoading && item.id === lastAssistantId && item.role === 'assistant'}
              onFollowupClick={(question) => {
                void chat.sendMessage({ text: question })
                requestInputFocus()
              }}
            />
          ))}
        </div>
      )}
    </List>
  )
}

export function useHotKey() {
  const { open, setOpen } = useAISearchContext()

  const onKeyPress = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false)
      e.preventDefault()
    }

    if (e.key === '/' && (e.metaKey || e.ctrlKey) && !open) {
      setOpen(true)
      e.preventDefault()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKeyPress)
    return () => window.removeEventListener('keydown', onKeyPress)
  }, [])
}

export function useAISearchContext() {
  return use(Context)!
}

function useChatContext() {
  return use(Context)!.chat
}
