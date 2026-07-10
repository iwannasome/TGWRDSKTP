import * as htmlToImage from 'html-to-image'

export type CapturePngOptions = {
  width: number
  height: number
  backgroundColor?: string
  pixelRatio?: number
}

export async function capturePngBytes(node: HTMLElement, options: CapturePngOptions): Promise<Uint8Array> {
  try {
    await document.fonts?.ready
  } catch {
    //
  }

  const images = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      if (img.complete) return
      try {
        await img.decode()
      } catch {
        //
      }
    })
  )

  const captureOptions = {
    cacheBust: true,
    backgroundColor: options.backgroundColor ?? '#05070a',
    width: options.width,
    height: options.height,
    pixelRatio: options.pixelRatio ?? 1,
    style: { transform: 'none' }
  }

  const blob = await htmlToImage.toBlob(node, captureOptions)
  if (blob) return new Uint8Array(await blob.arrayBuffer())

  const dataUrl = await htmlToImage.toPng(node, captureOptions)
  const fallbackBlob = await fetch(dataUrl).then((res) => res.blob())
  return new Uint8Array(await fallbackBlob.arrayBuffer())
}

export async function writeOutputFile(directoryToken: string, filename: string, bytes: Uint8Array): Promise<string> {
  const res = await window.tgwr.writeOutputFile(directoryToken, filename, bytes)
  if (!res.ok) throw new Error(res.error ?? `Failed to write ${filename}`)
  return res.path
}

export async function writePngWithPickedDirectory(filename: string, bytes: Uint8Array): Promise<string | null> {
  const dir = await window.tgwr.pickOutputDir()
  if (!dir) return null
  return writeOutputFile(dir.token, filename, bytes)
}
