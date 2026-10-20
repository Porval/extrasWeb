export interface ScreenshotInput { contentType: string; data: string }
export function validatePaymentScreenshot(file: Pick<File, 'size' | 'type'>) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('付款截图仅支持 JPG、PNG 或 WebP 图片。')
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('付款截图需为非空图片，且不能超过 5 MB。')
}
export async function encodePaymentScreenshot(file: File): Promise<ScreenshotInput> {
  validatePaymentScreenshot(file)
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('付款截图读取失败，请重新选择。'))
    reader.onabort = () => reject(new Error('付款截图读取已取消。'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.readAsDataURL(file)
  })
  return { contentType: file.type, data }
}
