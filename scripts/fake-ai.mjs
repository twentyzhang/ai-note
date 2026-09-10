import { createServer } from 'node:http'

createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    const payload = JSON.parse(body)
    const content = payload.messages[1].content
    const json = content.slice(content.indexOf('['), content.lastIndexOf(']') + 1)
    const items = JSON.parse(json)
    const translations = Object.fromEntries(
      items.map((item) => [item.id, `【假译文】${String(item.text).slice(0, 20)}`])
    )
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(translations) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 80 }
      })
    )
  })
}).listen(8799, () => console.log('假 AI 服务已启动: http://localhost:8799/v1'))