import { NextRequest, NextResponse } from 'next/server'
import { list } from '@vercel/blob'
// archiver lacks types in some setups; import as any to avoid TS errors
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver: any = require('archiver')

export async function POST(req: NextRequest) {
  try {
    // Accept form submissions (from <form> POST) and JSON
    let runId: string | null = null
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      runId = body?.runId ?? null
    } else {
      const form = await req.formData()
      runId = (form.get('runId') as string) || null
    }
    if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 })

    // List blobs for this run
    const { blobs } = await list({ prefix: `runs/${runId}/` })
    const cropBlobs = blobs.filter(b => /\/room_\d+\.png$/i.test(b.pathname))
    if (cropBlobs.length === 0) {
      return NextResponse.json({ error: 'no crops found' }, { status: 404 })
    }

    // Create a zip archive in-memory and stream to response
    const archive = archiver('zip', { zlib: { level: 9 } })

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        archive.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        archive.on('end', () => controller.close())
        archive.on('error', (err: Error) => controller.error(err))
      }
    })

    // Fetch each blob and append
    await Promise.all(cropBlobs.map(async (b) => {
      const resp = await fetch(b.url, { cache: 'no-store' })
      if (!resp.ok) return
      const buf = new Uint8Array(await resp.arrayBuffer())
      archive.append(Buffer.from(buf), { name: b.pathname.split('/').pop() })
    }))
    archive.finalize()

    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="room_crops_${runId}.zip"`
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'zip failed' }, { status: 500 })
  }
}


