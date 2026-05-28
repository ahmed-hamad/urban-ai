// Persists chat messages in sessionStorage (survives page navigation, cleared on tab close).
// Key is scoped per user-ID so different users on the same browser never share history.
// Call clearChatSession(userId) from logout to wipe all channels for that user.

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'

function storageKey(channel, userId) {
  return `ua_chat_${channel}_${userId ?? 'anon'}`
}

export function clearChatSession(userId) {
  const prefix = `ua_chat_`
  Object.keys(sessionStorage)
    .filter(k => k.startsWith(prefix) && (!userId || k.includes(userId)))
    .forEach(k => sessionStorage.removeItem(k))
}

/**
 * useChatSession(channel, welcomeMessage)
 *
 * Returns [messages, setMessages, clearMessages].
 * Messages are loaded from sessionStorage on mount and saved on every change.
 * historyRef tracks the last 12 exchanged turns for multi-turn API context.
 */
export function useChatSession(channel, welcomeMessage) {
  const { user } = useAuth()
  const key = storageKey(channel, user?.id)

  const [messages, setMessages] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [welcomeMessage]
  })

  // Restore API history context from persisted messages
  const historyRef = useRef(
    (() => {
      try {
        const raw = sessionStorage.getItem(key)
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed) && parsed.length > 1) {
          return parsed
            .slice(1)                                          // skip welcome
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-12)
            .map(m => ({ role: m.role, text: m.text || '' }))
        }
      } catch {}
      return []
    })()
  )

  // Persist on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(messages.slice(-60)))
    } catch {}
  }, [key, messages])

  const clearMessages = () => {
    setMessages([welcomeMessage])
    historyRef.current = []
    try { sessionStorage.removeItem(key) } catch {}
  }

  return [messages, setMessages, clearMessages, historyRef]
}
