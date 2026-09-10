import PDFDocument from 'pdfkit'

const BODY = 'This is a sample paragraph written for layout testing purposes only. '
const HEADER = 'Journal of Testing Vol. 12'

function render(
  doc: PDFKit.PDFDocument,
  draw: (d: PDFKit.PDFDocument) => void
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on('error', reject)
    draw(doc)
    doc.end()
  })
}

export function makeSingleColumnPdf(): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  return render(doc, (d) => {
    for (let page = 0; page < 3; page++) {
      if (page > 0) d.addPage()
      d.fontSize(9).text(HEADER, 60, 30)
      d.fontSize(9).text(`Page ${page + 1}`, 500, 800)
      d.fontSize(16).text('A Study of Something', 60, 90)
      let y = 130
      for (let i = 0; i < 12; i++) {
        d.fontSize(10).text(BODY.repeat(2), 60, y, { width: 470, lineGap: 2 })
        y += 46
      }
    }
  })
}

export function makeTwoColumnPdf(): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  return render(doc, (d) => {
    for (let page = 0; page < 3; page++) {
      if (page > 0) d.addPage()
      d.fontSize(9).text(HEADER, 60, 30)
      d.fontSize(9).text(`Page ${page + 1}`, 500, 800)
      d.fontSize(16).text('Two Column Study', 60, 80)
      let y = 120
      for (let i = 0; i < 10; i++) {
        d.fontSize(10).text(`LEFT ${i} ` + BODY, 60, y, { width: 220, lineGap: 2 })
        y += 52
      }
      y = 120
      for (let i = 0; i < 10; i++) {
        d.fontSize(10).text(`RIGHT ${i} ` + BODY, 310, y, { width: 220, lineGap: 2 })
        y += 52
      }
    }
  })
}