export { isMainThread } from 'worker_threads'

export const isWorkerMode = () => {
  const mode = process.env.WORKER_MODE?.trim().toLowerCase()
  return mode === 'true' || mode === '1' || mode === 'yes'
}

export { initializeParentWorker } from './parent_worker'
export { runWorker } from './dev_worker'
