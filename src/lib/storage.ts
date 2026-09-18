export interface StorageStatus {
  usage?: number
  quota?: number
  persistent?: boolean
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage) return {}
  const [estimate, persistent] = await Promise.all([
    navigator.storage.estimate?.().catch(() => ({} as StorageEstimate)) ?? ({} as StorageEstimate),
    navigator.storage.persisted?.().catch(() => false),
  ])
  return { usage: estimate.usage, quota: estimate.quota, persistent }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try { return await navigator.storage.persist() }
  catch { return false }
}

export async function assertStorageCapacity(requiredBytes: number): Promise<void> {
  const { usage, quota } = await getStorageStatus()
  if (usage !== undefined && quota !== undefined && quota - usage < requiredBytes) {
    throw new DOMException('This device does not report enough browser storage for this backup. Free some space and try again.', 'QuotaExceededError')
  }
}
