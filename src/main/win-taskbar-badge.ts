/**
 * Overlay taskbar Windows: Shell / ITaskbarList3 cần bitmap (PNG) ~16×16.
 * SVG qua nativeImage.createFromDataURL thường không hiển thị.
 * Lưu ý: Nếu Taskbar dùng "Use small taskbar buttons", Windows bỏ qua overlay (giới hạn OS).
 */
import { nativeImage, type NativeImage } from 'electron'
import { deflateSync } from 'node:zlib'

const W = 16
const H = 16
const RED = { r: 231, g: 76, b: 60, a: 255 }
const WHITE = { r: 255, g: 255, b: 255, a: 255 }

/** 3×5 pixel font (hàng từ trên xuống, '1' = vẽ) */
const GLYPH: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['010', '010', '111', '010', '010'],
}

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'binary')
  const crc = crc32(Buffer.concat([t, data]))
  const cbuf = Buffer.alloc(4)
  cbuf.writeUInt32BE(crc, 0)
  return Buffer.concat([len, t, data, cbuf])
}

function encodePngRgba(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function setPx(
  rgba: Buffer,
  width: number,
  x: number,
  y: number,
  c: { r: number; g: number; b: number; a: number }
): void {
  if (x < 0 || y < 0 || x >= width || y >= H) return
  const i = (y * width + x) * 4
  rgba[i] = c.r
  rgba[i + 1] = c.g
  rgba[i + 2] = c.b
  rgba[i + 3] = c.a
}

function fillCircle(rgba: Buffer, cx: number, cy: number, r: number, c: typeof RED): void {
  const r2 = r * r
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        setPx(rgba, W, x, y, c)
      }
    }
  }
}

function blitGlyph(
  rgba: Buffer,
  text: string,
  pixel: number,
  cx: number,
  cy: number
): void {
  const chars = [...text]
  const gw = 3
  const gh = 5
  const gap = pixel
  const charStep = gw * pixel + gap
  const totalW = chars.length * gw * pixel + Math.max(0, chars.length - 1) * gap
  const totalH = gh * pixel
  const left = Math.round(cx - totalW / 2)
  const oy = Math.round(cy - totalH / 2)

  for (let ci = 0; ci < chars.length; ci++) {
    const ch = chars[ci]
    const g = GLYPH[ch]
    if (!g) continue
    const charOx = left + ci * charStep
    for (let row = 0; row < gh; row++) {
      const line = g[row] ?? ''
      for (let col = 0; col < gw; col++) {
        if (line[col] !== '1') continue
        for (let dy = 0; dy < pixel; dy++) {
          for (let dx = 0; dx < pixel; dx++) {
            setPx(rgba, W, charOx + col * pixel + dx, oy + row * pixel + dy, WHITE)
          }
        }
      }
    }
  }
}

function renderBadgeRgba(count: number): Buffer {
  const rgba = Buffer.alloc(W * H * 4, 0)
  fillCircle(rgba, 8, 8, 7.2, RED)

  const label = count > 99 ? '99+' : String(count)
  let pixel = 2
  if (label.length >= 3) pixel = 1
  else if (label.length === 2) pixel = 1

  blitGlyph(rgba, label, pixel, 8, 8)
  return rgba
}

/** Icon overlay cho BrowserWindow.setOverlayIcon — luôn PNG 16×16. */
export function createWindowsTaskbarOverlayIcon(count: number): NativeImage {
  const png = encodePngRgba(renderBadgeRgba(count), W, H)
  const img = nativeImage.createFromBuffer(png)
  if (img.isEmpty()) {
    return nativeImage.createEmpty()
  }
  return img
}
