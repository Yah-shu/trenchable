import { kieFetch } from './client.ts'

interface UploadData {
  success?: boolean
  fileId?: string
  fileName?: string
  filePath?: string
  fileUrl?: string
  downloadUrl?: string
  expiresAt?: string
  uploadedAt?: string
}

interface UploadResponse {
  success?: boolean
  code?: number
  msg?: string
  data?: UploadData
}

function pickFileUrl(data?: UploadData): string | undefined {
  if (!data) return undefined
  return data.downloadUrl || data.fileUrl
}

function uniqueFileName(name: string): string {
  const stamp = Date.now().toString(36)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name}-${stamp}`
  return `${name.slice(0, dot)}-${stamp}${name.slice(dot)}`
}

export async function uploadFileStream(
  file: File | Blob,
  options: { uploadPath?: string; fileName?: string } = {},
): Promise<{ fileUrl: string; fileName?: string; expiresAt?: string }> {
  const originalName =
    options.fileName ||
    (file instanceof File && file.name ? file.name : `upload-${Date.now()}.bin`)
  const name = uniqueFileName(originalName)

  const form = new FormData()
  form.append('file', file, name)
  form.append('uploadPath', options.uploadPath ?? 'kie-studio')
  form.append('fileName', name)

  const res = await kieFetch<UploadResponse>(
    '/api/file-stream-upload',
    { method: 'POST', body: form },
    'upload',
  )

  const fileUrl = pickFileUrl(res.data)
  if (!fileUrl) {
    throw new Error(
      res.msg
        ? `${res.msg} (no downloadUrl/fileUrl in response)`
        : 'Upload succeeded but no downloadUrl/fileUrl returned',
    )
  }

  return {
    fileUrl,
    fileName: res.data?.fileName ?? name,
    expiresAt: res.data?.expiresAt,
  }
}

export async function uploadFromUrl(
  fileUrl: string,
  options: { uploadPath?: string; fileName?: string } = {},
): Promise<{ fileUrl: string; fileName: string }> {
  const sourceName = new URL(fileUrl).pathname.split('/').pop() || 'upload.bin'
  const fileName = uniqueFileName(options.fileName || sourceName)
  const res = await kieFetch<UploadResponse>(
    '/api/file-url-upload',
    {
      method: 'POST',
      body: JSON.stringify({
        fileUrl,
        uploadPath: options.uploadPath ?? 'kie-studio',
        fileName,
      }),
    },
    'upload',
  )

  const url = pickFileUrl(res.data)
  if (!url) throw new Error(res.msg || 'URL upload failed')
  return { fileUrl: url, fileName: res.data?.fileName ?? fileName }
}
