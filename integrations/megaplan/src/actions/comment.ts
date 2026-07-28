import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { IntegrationProps } from '../bp'

export const addComment: IntegrationProps['actions']['addComment'] = async () => {
  throw new RuntimeError('addComment: используйте startIntegrationOperation')
}

// File publication is capability-only. CloudAPI must pin every nested FileRef
// and start a fenced native durable operation; an ordinary action invocation
// must never fall back to inline bytes, base64, or internal Files API URLs.
export const publishCaseDocument: IntegrationProps['actions']['publishCaseDocument'] = async () => {
  throw new RuntimeError('publishCaseDocument: используйте startIntegrationOperation с immutable FileRef')
}
