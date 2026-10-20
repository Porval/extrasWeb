export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
}
export async function request(path: string, body?: Record<string, unknown>, headers: Record<string, string> = {}, timeoutMs = 12000): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    })
  } catch { throw new ApiError(0, '暂时无法连接服务，请稍后重试。') }
  let data: unknown
  try { data = await response.json() } catch { throw new ApiError(response.status, '服务响应异常，请稍后重试。') }
  const object = data as Record<string, unknown> | null
  if (!response.ok) throw new ApiError(response.status, object && typeof object.error === 'string' ? object.error : '请求失败，请稍后重试。')
  return data
}
