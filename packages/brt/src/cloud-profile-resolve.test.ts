import { describe, expect, it, vi } from 'vitest'
import * as cloudProfileResolve from './cloud-profile-resolve'
import type { ProfileCredentials } from './command-implementations/global-command'

const profile = (overrides: Partial<ProfileCredentials> = {}): ProfileCredentials => ({
  apiUrl: 'https://profile.example',
  workspaceId: 'ws',
  token: 'tok',
  ...overrides,
})

describe('resolveProfileName', () => {
  it('prefers --profile over the active profile', async () => {
    const name = await cloudProfileResolve.resolveProfileName({
      argvProfile: 'flag-profile',
      getActiveProfile: async () => 'active-profile',
    })
    expect(name).toBe('flag-profile')
  })

  it('falls back to the active profile when no --profile flag', async () => {
    const name = await cloudProfileResolve.resolveProfileName({
      argvProfile: undefined,
      getActiveProfile: async () => 'active-profile',
    })
    expect(name).toBe('active-profile')
  })

  it('falls back to "default" when neither --profile nor an active profile is set', async () => {
    const name = await cloudProfileResolve.resolveProfileName({
      argvProfile: undefined,
      getActiveProfile: async () => undefined,
    })
    expect(name).toBe('default')
  })
})

describe('resolveProfile', () => {
  it('reads the resolved profile name from FS', async () => {
    const readProfile = vi.fn(async () => profile({ token: 'abc' }))
    const result = await cloudProfileResolve.resolveProfile({
      argvProfile: 'foo',
      getActiveProfile: async () => undefined,
      readProfile,
    })
    expect(result.name).toBe('foo')
    expect(result.profile.token).toBe('abc')
    expect(readProfile).toHaveBeenCalledWith('foo')
  })
})

describe('resolveApiUrl', () => {
  it('prefers the explicit argv apiUrl above everything else', () => {
    const url = cloudProfileResolve.resolveApiUrl('https://flag.example/', profile(), { apiUrl: 'https://link.example' })
    expect(url).toBe('https://flag.example')
  })

  it('falls back to the link apiUrl, then the profile apiUrl, then the default, stripping trailing slashes', () => {
    expect(cloudProfileResolve.resolveApiUrl(undefined, profile(), { apiUrl: 'https://link.example/' })).toBe(
      'https://link.example'
    )
    expect(cloudProfileResolve.resolveApiUrl(undefined, profile({ apiUrl: 'https://profile.example/' }))).toBe(
      'https://profile.example'
    )
  })
})
