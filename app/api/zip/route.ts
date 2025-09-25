import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
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

    const runDir = path.join(process.cwd(), 'public', 'runs', runId)
    const exists = fssync.existsSync(runDir)
    if (!exists) return NextResponse.json({ error: 'run not found' }, { status: 404 })

    const zipPath = path.join(runDir, 'crops.zip')
    await new Promise<void>((resolve, reject) => {
      const output = fssync.createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', () => resolve())
      archive.on('error', reject)
      archive.pipe(output)
      // add room crops only
      const files = fssync.readdirSync(runDir)
      for (const f of files) {
        if (/^room_\d+\.png$/i.test(f)) {
          archive.file(path.join(runDir, f), { name: f })
        }
      }
      archive.finalize()
    })

    const file = await fs.readFile(zipPath)
    // Return as Uint8Array to satisfy BodyInit types
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="room_crops_${runId}.zip"`
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'zip failed' }, { status: 500 })
  }
}


