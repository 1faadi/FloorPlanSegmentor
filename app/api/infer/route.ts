import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { put } from '@vercel/blob'

const API_URL = 'https://serverless.roboflow.com'
const API_KEY = 'lrUs6QO2wCtJ0gJQ3NY8' // do not ship to client; server route only

type Prediction = {
  class?: string
  label?: string
  confidence?: number
  x?: number
  y?: number
  width?: number
  height?: number
  points?: any
  polygon?: any
}

function colorPalette() {
  return [
    [230,25,75],[60,180,75],[0,130,200],[245,130,48],[145,30,180],
    [70,240,240],[240,50,230],[210,245,60],[250,190,190],[0,128,128],
    [220,190,255],[128,128,0],[170,110,40],[255,215,180],[0,0,0],
  ]
}

function iou(a: [number, number, number, number], b: [number, number, number, number]) {
  const [ax0, ay0, ax1, ay1] = a
  const [bx0, by0, bx1, by1] = b
  const inter_x0 = Math.max(ax0, bx0)
  const inter_y0 = Math.max(ay0, by0)
  const inter_x1 = Math.min(ax1, bx1)
  const inter_y1 = Math.min(ay1, by1)
  const inter_w = Math.max(0, inter_x1 - inter_x0)
  const inter_h = Math.max(0, inter_y1 - inter_y0)
  const inter = inter_w * inter_h
  const area_a = Math.max(0, ax1 - ax0) * Math.max(0, ay1 - ay0)
  const area_b = Math.max(0, bx1 - bx0) * Math.max(0, by1 - by0)
  const union = area_a + area_b - inter
  return union > 0 ? inter / union : 0
}

function nms(boxes: { bbox: [number, number, number, number], confidence?: number }[], th = 0.5) {
  const sorted = [...boxes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  const kept: typeof boxes = []
  for (const b of sorted) {
    if (kept.every(k => iou(b.bbox, k.bbox) < th)) kept.push(b)
  }
  return kept
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('image') as File | null
  const modelId = (form.get('modelId') as string) || 'floor-plans-zeb7z/8'
  if (!file) return NextResponse.json({ error: 'image required' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const base64 = bytes.toString('base64')

  // workspace identifier used as blob prefix
  const runId = crypto.randomBytes(8).toString('hex')

  // call Roboflow
  const url = `${API_URL}/${modelId}`
  const res = await fetch(url + `?api_key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: base64,
    cache: 'no-store'
  })
  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `roboflow error: ${text}` }, { status: 502 })
  }
  const data = await res.json()

  const preds: Prediction[] = data.predictions ?? data.preds ?? []
  const boxes = preds.filter(p => p.x != null && p.y != null && p.width != null && p.height != null).map(p => {
    const x = Number(p.x), y = Number(p.y), w = Number(p.width), h = Number(p.height)
    const x0 = x - w / 2, y0 = y - h / 2, x1 = x + w / 2, y1 = y + h / 2
    return { label: (p.class ?? p.label ?? 'region').toString(), confidence: Number(p.confidence ?? 0), bbox: [x0, y0, x1, y1] as [number, number, number, number] }
  })
  const roomBoxes = boxes.filter(b => b.label.toLowerCase() === 'room')
  const roomNms = nms(roomBoxes, 0.5)

  // Save original upload to Blob
  const originalPut = await put(`runs/${runId}/original.jpg`, bytes, {
    access: 'public',
    contentType: 'image/jpeg',
  })

  // Draw boxes onto a copy and save; also create room crops
  const img = sharp(bytes)
  const meta = await img.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  // Build SVG overlay for boxes
  const palette = colorPalette()
  const rects: string[] = []
  boxes.forEach((b, i) => {
    const [x0, y0, x1, y1] = b.bbox
    const [r, g, bl] = b.label.toLowerCase() === 'room' ? palette[i % palette.length] : palette[Math.abs((b.label||'').split('').reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0,0)) % palette.length]
    const color = `rgba(${r},${g},${bl},1)`
    rects.push(`<rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="none" stroke="${color}" stroke-width="3" />`)
  })
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rects.join('')}</svg>`)
  const boxesBuf = await sharp(bytes).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer()
  const boxesPut = await put(`runs/${runId}/boxes.png`, boxesBuf, {
    access: 'public',
    contentType: 'image/png',
  })

  // Overlay: draw semi transparent polygons if present (simple: just copy original for now)
  const overlayPut = await put(`runs/${runId}/overlay.png`, bytes, {
    access: 'public',
    contentType: 'image/png',
  })

  const roomCropUrls: string[] = []
  for (let i = 0; i < roomNms.length; i++) {
    const [x0, y0, x1, y1] = roomNms[i].bbox
    const ix0 = Math.max(0, Math.round(x0))
    const iy0 = Math.max(0, Math.round(y0))
    const ix1 = Math.min(width, Math.round(x1))
    const iy1 = Math.min(height, Math.round(y1))
    if (ix1 > ix0 && iy1 > iy0) {
      const crop = await sharp(bytes).extract({ left: ix0, top: iy0, width: ix1 - ix0, height: iy1 - iy0 }).png().toBuffer()
      const cropName = `room_${String(i+1).padStart(3,'0')}.png`
      const cropPut = await put(`runs/${runId}/${cropName}`, crop, {
        access: 'public',
        contentType: 'image/png',
      })
      roomCropUrls.push(cropPut.url)
    }
  }

  const counts = { room: roomNms.length }

  const overlayUrl = overlayPut.url
  const boxesUrl = boxesPut.url

  return NextResponse.json({
    counts,
    predictions: data,
    boxes,
    roomNms: roomNms,
    originalUrl: originalPut.url,
    overlayUrl,
    boxesUrl,
    roomCropUrls,
    runId
  })
}


