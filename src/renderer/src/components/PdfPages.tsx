import { useEffect, useRef, useState, type JSX } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDF_SCALE } from '../lib/scrollSync'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface Props {
  data: Uint8Array
}

export default function PdfPages({ data }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return
    container.replaceChildren()

    const task = pdfjs.getDocument({ data: new Uint8Array(data) })
    task.promise
      .then(async (doc) => {
        if (cancelled) return
        const scale = PDF_SCALE
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.display = 'block'
          canvas.style.margin = '0 auto 16px'
          canvas.style.boxShadow = '0 1px 6px rgba(0,0,0,.15)'
          canvas.dataset.page = String(n)
          container.appendChild(canvas)
          const context = canvas.getContext('2d')
          if (!context) continue
          await page.render({ canvasContext: context, viewport }).promise
        }
      })
      .catch(() => {
        if (!cancelled) setError('这篇 PDF 无法渲染，文件可能已损坏')
      })

    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [data])

  if (error) return <p style={{ color: '#b3261e', padding: 24 }}>{error}</p>
  return <div ref={containerRef} style={{ background: '#f0f0f2', padding: 16 }} />
}