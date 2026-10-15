import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './context.js'
import { derivePasswordProof } from './password.js'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const checkSession = useCallback((signal) => {
    const timeout = AbortSignal.timeout(15000)
    return fetch('/api/auth/me', {
      credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store',
    }).then(async (response) => {
      if (signal?.aborted) return
      if (response.status === 401 || response.status === 403) { setUser(null); return }
      if (!response.ok) throw new Error('Não foi possível verificar sua sessão.')
      const data = await response.json()
      if (!signal?.aborted) setUser(data.user)
    }).catch((failure) => {
      if (signal?.aborted) return
      setUser(null)
      setError(failure.message || 'Não foi possível conectar à API.')
    }).finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    checkSession(controller.signal)
    return () => controller.abort()
  }, [checkSession])

  function refresh() {
    setLoading(true)
    setError('')
    return checkSession()
  }

  async function login(username, password, role = 'ADMIN') {
    const challengeResponse = await fetch(`/api/auth/challenge?username=${encodeURIComponent(username)}`, {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    const challenge = await challengeResponse.json().catch(() => null)
    if (!challengeResponse.ok) throw new Error(challenge?.error || 'Não foi possível iniciar o login.')
    if (challenge?.algorithm !== 'PBKDF2-SHA256') throw new Error('Parâmetros de autenticação inválidos')
    const proof = await derivePasswordProof(password, challenge.salt, challenge.iterations)
    const response = await fetch(role === 'CREATOR' ? '/api/auth/creator/login' : '/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes' },
      body: JSON.stringify({ username, proof }), signal: AbortSignal.timeout(15000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'Não foi possível entrar.')
    setUser(data.user)
    setError('')
  }

  async function logout() {
    const response = await fetch('/api/auth/logout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'X-Requested-With': 'Cinemotes' }, signal: AbortSignal.timeout(15000),
    })
    if (!response.ok && response.status !== 401) throw new Error('Não foi possível encerrar a sessão. Tente novamente.')
    setUser(null)
  }

  const invalidate = useCallback(() => setUser(null), [])

  return <AuthContext.Provider value={{ user, loading, error, login, logout, refresh, invalidate }}>{children}</AuthContext.Provider>
}
