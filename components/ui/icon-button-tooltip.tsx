'use client'

import type { ComponentProps, FocusEvent, MouseEvent, ReactElement, Ref } from 'react'
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export type IconButtonTooltipSide = 'top' | 'bottom'
export type IconButtonTooltipPlacement = IconButtonTooltipSide | 'auto'

type IconButtonTooltipProps = {
  label: string
  /** Preferred side; `auto` picks based on viewport space (default). */
  side?: IconButtonTooltipPlacement
  children: ReactElement<ComponentProps<'button'>>
}

const GAP_PX = 6
const VIEWPORT_PADDING_PX = 8

type TooltipCoords = {
  top: number
  left: number
  maxWidth: number
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(value)
      else ref.current = value
    }
  }
}

function pickSide(
  rect: DOMRect,
  preferred: IconButtonTooltipPlacement,
  tooltipHeight: number,
): IconButtonTooltipSide {
  if (preferred !== 'auto') return preferred

  const need = tooltipHeight + GAP_PX
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom

  if (spaceAbove < need && spaceBelow >= need) return 'bottom'
  if (spaceBelow < need && spaceAbove >= need) return 'top'
  return spaceBelow >= spaceAbove ? 'bottom' : 'top'
}

function computeCoords(
  buttonRect: DOMRect,
  tooltipRect: DOMRect,
  preferred: IconButtonTooltipPlacement,
): { coords: TooltipCoords; resolvedSide: IconButtonTooltipSide } {
  const resolvedSide = pickSide(buttonRect, preferred, tooltipRect.height)
  const maxWidth = Math.min(280, window.innerWidth - VIEWPORT_PADDING_PX * 2)

  let left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2
  left = Math.max(
    VIEWPORT_PADDING_PX,
    Math.min(left, window.innerWidth - tooltipRect.width - VIEWPORT_PADDING_PX),
  )

  const top =
    resolvedSide === 'bottom'
      ? buttonRect.bottom + GAP_PX
      : buttonRect.top - GAP_PX - tooltipRect.height

  return {
    coords: { top, left, maxWidth },
    resolvedSide,
  }
}

const tooltipBubbleClassName =
  'pointer-events-none fixed z-[100] inline-flex max-w-[min(280px,calc(100vw-16px))] whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium shadow-md bg-fd-foreground text-fd-background border-fd-foreground/25 dark:border-neutral-300 dark:bg-white dark:text-neutral-950'

/** Icon button with viewport-aware tooltip (portaled, fixed position). */
export function IconButtonTooltip({ label, side = 'auto', children }: IconButtonTooltipProps) {
  const tooltipId = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const tooltipMeasureRef = useRef<HTMLSpanElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<TooltipCoords | null>(null)
  const [resolvedSide, setResolvedSide] = useState<IconButtonTooltipSide>('bottom')

  function updatePosition() {
    const button = buttonRef.current
    const tooltip = tooltipMeasureRef.current
    if (!button || !tooltip) return

    const result = computeCoords(
      button.getBoundingClientRect(),
      tooltip.getBoundingClientRect(),
      side,
    )
    setCoords(result.coords)
    setResolvedSide(result.resolvedSide)
  }

  function showTooltip() {
    setVisible(true)
  }

  function hideTooltip() {
    setVisible(false)
    setCoords(null)
  }

  useLayoutEffect(() => {
    if (!visible) return
    updatePosition()
  }, [visible, label, side])

  useEffect(() => {
    if (!visible) return

    function handleReposition() {
      updatePosition()
    }

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [visible, label, side])

  if (!isValidElement(children)) return children

  const ariaLabel =
    typeof children.props['aria-label'] === 'string' ? children.props['aria-label'] : label

  const button = cloneElement(children, {
    ref: mergeRefs(buttonRef, children.props.ref),
    title: label,
    'aria-label': ariaLabel,
    'aria-describedby': visible ? tooltipId : undefined,
    className: cn(children.props.className),
    onMouseEnter: (event: MouseEvent<HTMLButtonElement>) => {
      children.props.onMouseEnter?.(event)
      showTooltip()
    },
    onMouseLeave: (event: MouseEvent<HTMLButtonElement>) => {
      children.props.onMouseLeave?.(event)
      hideTooltip()
    },
    onFocus: (event: FocusEvent<HTMLButtonElement>) => {
      children.props.onFocus?.(event)
      showTooltip()
    },
    onBlur: (event: FocusEvent<HTMLButtonElement>) => {
      children.props.onBlur?.(event)
      hideTooltip()
    },
  })

  const tooltipNode = (
    <>
      <span
        ref={tooltipMeasureRef}
        role="tooltip"
        id={tooltipId}
        aria-hidden={!visible}
        className={cn(
          tooltipBubbleClassName,
          visible && coords ? 'opacity-100' : 'fixed -left-[9999px] top-0 opacity-0',
        )}
        style={
          visible && coords
            ? { top: coords.top, left: coords.left, maxWidth: coords.maxWidth }
            : undefined
        }
        data-side={resolvedSide}
      >
        {label}
      </span>
    </>
  )

  return (
    <>
      {button}
      {typeof document !== 'undefined' ? createPortal(tooltipNode, document.body) : null}
    </>
  )
}
