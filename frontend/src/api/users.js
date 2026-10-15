export async function requestUsers(path, { method = 'GET', body, signal } = {}, invalidate) {
  const timeout = AbortSignal.timeout(15000)
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (response.status === 401) invalidate()
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.')
  return data
}
