const API_BASE_URL = 'http://localhost:8000'

export async function requestJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `${path} failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}
