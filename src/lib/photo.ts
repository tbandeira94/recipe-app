import type { PreparedRecipePhoto } from '../types'
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_INPUT_BYTES, PHOTO_OUTPUT_SIZE, PHOTO_THUMBNAIL_JPEG_QUALITY, PHOTO_THUMBNAIL_SIZE } from './photoConfig'

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

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image could not be encoded.')), 'image/jpeg', quality / 100)
  })
}

function drawSquare(image: HTMLImageElement, size: number): HTMLCanvasElement {
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  const sourceX = (image.naturalWidth - sourceSize) / 2
  const sourceY = (image.naturalHeight - sourceSize) / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)
  return canvas
}

export async function prepareRecipePhoto(file: File): Promise<PreparedRecipePhoto> {
  if (!file.type.startsWith('image/') || file.size > PHOTO_MAX_INPUT_BYTES) throw new Error('Image is not supported.')

  const image = await loadImage(file)
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image has no dimensions.')
  const [full, thumbnail] = await Promise.all([
    canvasToJpeg(drawSquare(image, PHOTO_OUTPUT_SIZE), PHOTO_JPEG_QUALITY),
    canvasToJpeg(drawSquare(image, PHOTO_THUMBNAIL_SIZE), PHOTO_THUMBNAIL_JPEG_QUALITY),
  ])
  return { full, thumbnail }
}
