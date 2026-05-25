import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiClient, isApiError, type ChatAssistantRequest } from '../api/client'
import { Icons } from './icons'
import type { PageId } from './layout/Sidebar'

type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  text: string
}

const pageContext: Record<PageId, { title: string; metrics: string[]; queryPrefixes: string[] }> = {
  dashboard: {
    title: 'Executive Overview',
    metrics: ['BDI', 'FBX', 'risk score', 'high severity anomalies', 'chokepoint stress', 'propagation links'],
    queryPrefixes: ['stats', 'insights', 'indices', 'risk', 'anomalies'],
  },
  indices: {
    title: 'Freight & Indices',
    metrics: ['BDI', 'FBX', 'WCI', 'SCFI', 'forecast', 'correlation'],
    queryPrefixes: ['indices', 'correlations'],
  },
  vessels: {
    title: 'Live Vessel Map',
    metrics: ['vessel count', 'SOG', 'COG', 'navigation status', 'ETA drift', 'watchlist reason'],
    queryPrefixes: ['vessels', 'ports', 'risk', 'anomalies'],
  },
  ports: {
    title: 'Port Congestion',
    metrics: ['anchored count', 'moored count', 'total in area', 'average dwell hours', 'median speed', 'port calls'],
    queryPrefixes: ['ports', 'risk', 'anomalies'],
  },
  analytics: {
    title: 'Exploratory Analysis',
    metrics: ['port activity', 'comparison metric', 'anomaly score', 'correlation', 'baseline', 'z-score'],
    queryPrefixes: ['ports', 'anomalies', 'correlations'],
  },
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    text: 'Mình đọc tab đang mở và giải thích chỉ số bằng Gemini. Hỏi về BDI, risk score, dwell time, anomaly, forecast, hoặc giá trị đang thấy.',
  },
]

function summarizeData(data: unknown): unknown {
  if (Array.isArray(data)) {
    return {
      type: 'array',
      rows: data.length,
      sample: data.slice(0, 3).map(item => summarizeData(item)),
    }
  }
  if (data && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>).slice(0, 12)
    return Object.fromEntries(entries.map(([key, value]) => [key, summarizeData(value)]))
  }
  return data
}

function buildChatContext(page: PageId, queryClient: QueryClient): ChatAssistantRequest['context'] {
  const activeContext = pageContext[page]
  const cachedQueries = queryClient.getQueryCache().findAll()
    .filter(query => activeContext.queryPrefixes.includes(String(query.queryKey[0])))
    .slice(0, 10)
    .map(query => ({
      key: query.queryKey,
      state: query.state.status,
      updatedAt: query.state.dataUpdatedAt || null,
      data: summarizeData(query.state.data),
    }))

  return {
    tab: activeContext.title,
    visibleMetricTypes: activeContext.metrics,
    cachedQueries,
  }
}

function errorText(error: unknown): string {
  if (isApiError(error)) return error.detail
  if (error instanceof Error) return error.message
  return 'Chat request failed'
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function renderChatText(text: string): React.ReactNode {
  const blocks = text.split(/\n{2,}/).filter(Boolean)
  return blocks.map((block, index) => {
    const lines = block.split('\n').filter(Boolean)
    const bulletLines = lines.filter(line => /^\s*[*-]\s+/.test(line))
    if (bulletLines.length === lines.length) {
      return (
        <ul key={index} className="chatbot-widget__list">
          {bulletLines.map((line, lineIndex) => (
            <li key={lineIndex}>{renderInlineMarkdown(line.replace(/^\s*[*-]\s+/, ''))}</li>
          ))}
        </ul>
      )
    }
    return <p key={index}>{renderInlineMarkdown(lines.join(' '))}</p>
  })
}

export const ChatbotWidget: React.FC<{ page: PageId }> = ({ page }) => {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const nextId = useRef(2)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const activeContext = useMemo(() => pageContext[page], [page])

  useEffect(() => {
    if (!open || messagesRef.current === null) return
    window.requestAnimationFrame(() => {
      if (messagesRef.current !== null) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight
      }
    })
  }, [messages, loading, open])

  const sendMessage = async () => {
    const question = draft.trim()
    if (!question || loading) return
    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text: question }
    setMessages(prev => [...prev, userMessage])
    setDraft('')
    setLoading(true)
    try {
      const response = await apiClient.chatAssistant({
        page,
        question,
        context: buildChatContext(page, queryClient),
      })
      setMessages(prev => [...prev, { id: nextId.current++, role: 'assistant', text: response.answer }])
    } catch (error) {
      setMessages(prev => [...prev, { id: nextId.current++, role: 'assistant', text: errorText(error) }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chatbot-widget" aria-live="polite">
      {open && (
        <section className="chatbot-widget__panel" aria-label="Gemini chat assistant">
          <div className="chatbot-widget__header">
            <div>
              <div className="chatbot-widget__title">Gemini Assistant</div>
              <div className="chatbot-widget__tab">{activeContext.title}</div>
            </div>
            <button className="app-button app-button--ghost" aria-label="Close chat assistant" onClick={() => setOpen(false)}>
              <Icons.X size={16} />
            </button>
          </div>
          <div className="chatbot-widget__messages" ref={messagesRef}>
            {messages.map(message => (
              <div key={message.id} className={`chatbot-widget__message chatbot-widget__message--${message.role}`}>
                {renderChatText(message.text)}
              </div>
            ))}
            {loading && <div className="chatbot-widget__message chatbot-widget__message--assistant">Gemini đang phân tích tab này...</div>}
          </div>
          <form
            className="chatbot-widget__composer"
            onSubmit={event => {
              event.preventDefault()
              void sendMessage()
            }}
          >
            <input
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Hỏi về chỉ số trên tab này"
              aria-label="Ask Gemini about this tab"
            />
            <button className="app-button chatbot-widget__send" type="submit" aria-label="Send chat message" disabled={!draft.trim() || loading}>
              <Icons.Send size={15} />
            </button>
          </form>
        </section>
      )}
      <button
        className="chatbot-widget__toggle"
        aria-label={open ? 'Close chat assistant' : 'Open chat assistant'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {open ? <Icons.X size={20} /> : <Icons.MessageCircle size={22} />}
      </button>
    </div>
  )
}
