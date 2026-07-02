export interface HubCacheEntry {
  id: string
  name: string
  version: string
  updatedAt: string
  createdAt: string
  title?: string
  description?: string
  iconUrl?: string
  public: boolean
  visibility: 'public' | 'private' | 'unlisted'
  ownerWorkspace?: {
    id: string
    name: string
  }
  verificationStatus?: 'unapproved' | 'approved' | 'pending' | 'rejected'
}

export interface HubCacheData {
  lastUpdated: string
  integrations: HubCacheEntry[]
}
