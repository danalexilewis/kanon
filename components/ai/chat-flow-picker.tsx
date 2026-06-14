'use client'

import { buttonVariants } from 'fumadocs-ui/components/ui/button'
import { cn } from '@/lib/cn'
import { IconButtonTooltip } from '@/components/ui/icon-button-tooltip'
import { CHAT_FLOWS, type ChatFlowId } from '@/lib/chat-flows'

type ChatFlowPickerProps = {
  activeFlowId: ChatFlowId | null
  onSelectFlow: (flowId: ChatFlowId | null) => void
  disabled?: boolean
  className?: string
}

export function ChatFlowPicker({
  activeFlowId,
  onSelectFlow,
  disabled = false,
  className,
}: ChatFlowPickerProps) {
  function toggleFlow(flowId: ChatFlowId) {
    if (disabled) return
    onSelectFlow(activeFlowId === flowId ? null : flowId)
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5 px-2 pt-2', className)}>
      {CHAT_FLOWS.map((flow) => {
        const isActive = activeFlowId === flow.id

        return (
          <IconButtonTooltip key={flow.id} label={flow.description} side="bottom">
            <button
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              className={cn(
                buttonVariants({
                  color: isActive ? 'primary' : 'secondary',
                  className: 'h-auto rounded-full px-2.5 py-1 text-xs font-medium',
                }),
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggleFlow(flow.id)}
            >
              {flow.label}
            </button>
          </IconButtonTooltip>
        )
      })}
    </div>
  )
}
