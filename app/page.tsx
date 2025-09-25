"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
// shadcn/ui components
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export default function Page() {
  const [file, setFile] = useState<File | null>(null)
  const [modelId] = useState("floor-plans-zeb7z/8")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [showBoxes, setShowBoxes] = useState(true)
  const [onlyRooms, setOnlyRooms] = useState(true)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const palette = useMemo(
    () => [
      [230, 25, 75], [60, 180, 75], [0, 130, 200], [245, 130, 48], [145, 30, 180],
      [70, 240, 240], [240, 50, 230], [210, 245, 60], [250, 190, 190], [0, 128, 128],
      [220, 190, 255], [128, 128, 0], [170, 110, 40], [255, 215, 180], [0, 0, 0],
    ],
    [],
  )

  function hashCode(s: string) {
    let h = 0
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i)
      h |= 0
    }
    return h
  }
  function colorForLabel(lbl: string, idx: number) {
    if (lbl.toLowerCase() === 'room') {
      const [r, g, b] = palette[idx % palette.length]
      return `rgba(${r},${g},${b},1)`
    }
    const j = Math.abs(hashCode(lbl)) % palette.length
    const [r, g, b] = palette[j]
    return `rgba(${r},${g},${b},1)`
  }

  useEffect(() => {
    if (!result || !imgRef.current || !canvasRef.current) return
    const img = imgRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (showOverlay) {
        ctx.globalAlpha = 1
        ctx.drawImage(img, 0, 0)
      }
      const boxes = (onlyRooms ? result.roomNms : result.boxes) as any[]
      if (showBoxes && boxes) {
        boxes.forEach((b: any, i: number) => {
          const [x0, y0, x1, y1] = b.bbox
          const lbl = b.label
          const color = colorForLabel(lbl, i)
          ctx.strokeStyle = color
          ctx.lineWidth = 3
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
          const tag = lbl
          ctx.font = '14px Inter, sans-serif'
          const tw = ctx.measureText(tag).width
          const th = 18
          ctx.fillStyle = color.replace(',1)', ',0.75)')
          ctx.fillRect(x0, y0, tw + 8, th)
          ctx.fillStyle = '#fff'
          ctx.fillText(tag, x0 + 4, y0 + 14)
        })
      }
    }
    img.onload = draw
    if (img.complete) draw()
    img.src = result.originalUrl
  }, [result, showOverlay, showBoxes, onlyRooms, palette])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setResult(null)
    const fd = new FormData()
    fd.append('image', file)
    fd.append('modelId', modelId)
    const res = await fetch('/api/infer', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) {
      setError(data?.error || 'Request failed')
    } else {
      setError(null)
      setResult(data)
    }
    setLoading(false)
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Floorplan Segmentation</h1>
      </header>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload floor plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] items-end">
            <div
              className="dropzone"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag') }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag') }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag'); const f = e.dataTransfer.files?.[0]; if (f) setFile(f) }}
            >
              <p className="m-0">{file ? `Selected: ${file.name}` : 'Drag & drop an image here or click to choose'}</p>
              <div className="h-2" />
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!file || loading}>{loading ? 'Processing…' : 'Analyze'}</Button>
            </div>
          </form>
          {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6 mb-4">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <span className="inline-block rounded bg-white/10 px-2 py-1">Rooms: <strong className="ml-1">{result?.counts?.room ?? 0}</strong></span>
                {typeof result?.counts?.total === 'number' && (
                  <span className="inline-block rounded bg-white/10 px-2 py-1">Total: <strong className="ml-1">{result.counts.total}</strong></span>
                )}
              </div>
              <div className="flex items-center gap-6">
                <label className="inline-flex items-center gap-2">
                  <Checkbox id="show-image" checked={showOverlay} onCheckedChange={v => setShowOverlay(Boolean(v))} />
                  <Label htmlFor="show-image" className="cursor-pointer">Show image</Label>
                </label>
                <label className="inline-flex items-center gap-2">
                  <Checkbox id="show-boxes" checked={showBoxes} onCheckedChange={v => setShowBoxes(Boolean(v))} />
                  <Label htmlFor="show-boxes" className="cursor-pointer">Show boxes</Label>
                </label>
                <label className="inline-flex items-center gap-2">
                  <Checkbox id="only-rooms" checked={onlyRooms} onCheckedChange={v => setOnlyRooms(Boolean(v))} />
                  <Label htmlFor="only-rooms" className="cursor-pointer">Rooms only</Label>
                </label>
              </div>
            </div>
            <div>
              <img ref={imgRef} alt="original" className="hidden" />
              <canvas ref={canvasRef} className="w-full h-auto block rounded border border-white/10 bg-black/10" />
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              <Button variant="default" size="sm" className="min-w-[180px]"
                onClick={() => triggerDownload(result.overlayUrl, 'overlay.png')}>Download overlay</Button>
              <Button variant="default" size="sm" className="min-w-[180px]"
                onClick={() => triggerDownload(result.boxesUrl, 'boxes.png')}>Download boxes</Button>
              <form method="POST" action="/api/zip">
                <input type="hidden" name="runId" value={result.runId} />
                <Button type="submit" size="sm" className="min-w-[220px]">Download room crops (ZIP)</Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}


