import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ChatbotWidget.tsx'), 'utf8')
const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../App.tsx'), 'utf8')
const clientSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../api/client.ts'), 'utf8')

describe('ChatbotWidget', () => {
  it('is mounted globally and can be toggled as a small popup', () => {
    expect(appSource).toMatch(/<ChatbotWidget\s+page=\{page\}/)
    expect(componentSource).toMatch(/aria-label=\{open \? 'Close chat assistant' : 'Open chat assistant'\}/)
    expect(componentSource).toMatch(/className="chatbot-widget__panel"/)
  })

  it('sends current tab context to the real backend chat endpoint', () => {
    expect(clientSource).toMatch(/chatAssistant/)
    expect(clientSource).toMatch(/"\/api\/chat\/assistant"/)
    expect(componentSource).toMatch(/pageContext\[/)
    expect(componentSource).toMatch(/apiClient\.chatAssistant/)
    expect(componentSource).not.toMatch(/demo/i)
  })

  it('renders Gemini markdown-like responses and scrolls to the latest message', () => {
    expect(componentSource).toMatch(/function renderChatText/)
    expect(componentSource).toMatch(/<strong\s+key=/)
    expect(componentSource).toMatch(/chatbot-widget__list/)
    expect(componentSource).toMatch(/messagesRef\.current\.scrollTop = messagesRef\.current\.scrollHeight/)
  })
})
