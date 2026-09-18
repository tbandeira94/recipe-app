const MAX_INPUT_BYTES = 25 * 1024 * 1024
const OUTPUT_SIZE = 1200

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image could not be decoded.'))
    }
    image.src = url
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read.'))
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image could not be encoded.')), 'image/jpeg', 0.82)
  })
}

export async function prepareRecipePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > MAX_INPUT_BYTES) throw new Error('Image is not supported.')

  const image = await loadImage(file)
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image has no dimensions.')

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  const sourceX = (image.naturalWidth - sourceSize) / 2
  const sourceY = (image.naturalHeight - sourceSize) / 2
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  return blobToDataUrl(await canvasToJpeg(canvas))
}
