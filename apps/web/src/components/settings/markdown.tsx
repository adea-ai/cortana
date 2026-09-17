import { For, type JSX } from 'solid-js'

export function SafeMarkdown(incoming: { text: string }) {
  const props = incoming
  return <div class="safe-markdown">{renderMarkdownToNodes(props.text)}</div>
}
function renderMarkdownToNodes(text: string): JSX.Element[] {
  const nodes: JSX.Element[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let currentList: {
    ordered: boolean
    items: string[]
  } | null = null
  const closeList = () => {
    if (!currentList) return
    if (currentList.ordered) {
      nodes.push(
        <ol>
          <For each={currentList.items}>
            {(item) => (
              // markdown list items are positional
              <li>{parseInlineMarkdown(item)}</li>
            )}
          </For>
        </ol>
      )
    } else {
      nodes.push(
        <ul>
          <For each={currentList.items}>
            {(item) => (
              // markdown list items are positional
              <li>{parseInlineMarkdown(item)}</li>
            )}
          </For>
        </ul>
      )
    }
    currentList = null
  }
  for (const line of lines) {
    const trimmed = line.trimEnd()
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/)
    if (!trimmed) {
      closeList()
      continue
    }
    if (heading) {
      closeList()
      const level = heading[1].length
      const title = parseInlineMarkdown(heading[2])
      if (level === 1) nodes.push(<h1>{title}</h1>)
      else if (level === 2) nodes.push(<h2>{title}</h2>)
      else nodes.push(<h3>{title}</h3>)
      continue
    }
    if (bullet) {
      if (!currentList || currentList.ordered) {
        closeList()
        currentList = {
          ordered: false,
          items: [],
        }
      }
      currentList.items.push(bullet[1])
      continue
    }
    if (ordered) {
      if (!currentList || !currentList.ordered) {
        closeList()
        currentList = {
          ordered: true,
          items: [],
        }
      }
      currentList.items.push(ordered[1])
      continue
    }
    closeList()
    nodes.push(<p>{parseInlineMarkdown(trimmed)}</p>)
  }
  closeList()
  return nodes
}
function parseInlineMarkdown(value: string): JSX.Element[] {
  const parts = value.split(/(`[^`]*`|\[[^\]]+\]\([^)]+\))/g)
  const nodes: JSX.Element[] = []
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code>{part.slice(1, -1)}</code>)
      continue
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const url = safeMarkdownUrl(link[2])
      if (url) {
        nodes.push(
          <a href={url} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        )
      } else {
        nodes.push(<span>{part}</span>)
      }
      continue
    }
    nodes.push(<span>{part}</span>)
  }
  return nodes
}
function safeMarkdownUrl(value: string): string | null {
  try {
    const candidate = new URL(value)
    if (candidate.protocol === 'http:' || candidate.protocol === 'https:') return candidate.href
    return null
  } catch {
    return null
  }
}
