import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { RawPage, TextItem } from '../../shared/types'

async function open(data: Uint8Array) {
  return getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: VerbosityLevel.ERRORS
  }).promise
}

export async function extractPdf(data: Uint8Array): Promise<RawPage[]> {
  const doc = await open(data)
  const pages: RawPage[] = []

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: TextItem[] = []

    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str.trim()) continue
      const t = raw.transform as number[]
      const fontSize = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10
      const x = t[4]
      const y = viewport.height - t[5] - fontSize
      items.push({
        text: raw.str,
        x,
        y: Math.max(0, y),
        w: raw.width,
        h: raw.height || fontSize,
        fontSize
      })
    }

    pages.push({ page: pageNumber, width: viewport.width, height: viewport.height, items })
    page.cleanup()
  }

  await doc.destroy()
  return pages
}

export async function extractMeta(
  data: Uint8Array
): Promise<{ title: string | null; authors: string[] }> {
  const doc = await open(data)
  try {
    const info = await doc.getMetadata()
    const raw = (info.info ?? {}) as Record<string, unknown>
    const title = typeof raw.Title === 'string' && raw.Title.trim() ? raw.Title.trim() : null
    const authorText = typeof raw.Author === 'string' ? raw.Author : ''
    const authors = authorText
      .split(/[,;、]|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean)
    return { title, authors }
  } catch {
    return { title: null, authors: [] }
  } finally {
    await doc.destroy()
  }
}