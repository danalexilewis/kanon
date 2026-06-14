'use client'

import Link from 'fumadocs-core/link'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Render assistant markdown in the Ask AI panel. */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => <Link href={href ?? '#'}>{children}</Link>,
      }}
    >
      {text}
    </Markdown>
  )
}
