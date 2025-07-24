import CryptoJS from 'crypto-js'
import { cookies } from 'next/headers'

interface SavedVTOPCredentials {
  username: string
  encryptedPassword: string
  timestamp: number
}

const COOKIE_NAME = 'vtop_linked_credentials'
const ENCRYPTION_KEY_COOKIE = 'vtop_master_key'

async function getCookieValue(name: string): Promise<string | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(name)
  return cookie ? decodeURIComponent(cookie.value) : null
}

async function getMasterKey(): Promise<string | null> {
  return await getCookieValue(ENCRYPTION_KEY_COOKIE)
}

export async function getSavedVTOPCredentials(): Promise<SavedVTOPCredentials | null> {
  try {
    const stored = await getCookieValue(COOKIE_NAME)
    if (!stored) return null

    return JSON.parse(stored)
  } catch (error) {
    console.error('Failed to retrieve VTOP credentials:', error)
    return null
  }
}

export async function getDecryptedVTOPCredentials(): Promise<{ username: string; password: string } | null> {
  try {
    const saved = await getSavedVTOPCredentials()
    if (!saved) return null

    const masterKey = await getMasterKey()
    if (!masterKey) return null

    const decryptedPassword = CryptoJS.AES.decrypt(saved.encryptedPassword, masterKey).toString(
      CryptoJS.enc.Utf8
    )

    if (!decryptedPassword) {
      return null
    }

    return {
      username: saved.username,
      password: decryptedPassword,
    }
  } catch (error) {
    console.error('Failed to decrypt VTOP credentials:', error)
    return null
  }
}

export async function getFormattedVTOPCredentials(): Promise<{
  username: string
  encryptedPassword: string
} | null> {
  try {
    const decrypted = await getDecryptedVTOPCredentials()
    if (!decrypted) return null

    const sessionKey = CryptoJS.lib.WordArray.random(256 / 8).toString()
    const encryptedPassword = CryptoJS.AES.encrypt(decrypted.password, sessionKey).toString()

    return {
      username: decrypted.username,
      encryptedPassword: `${encryptedPassword}:::${sessionKey}`,
    }
  } catch (error) {
    console.error('Failed to format VTOP credentials:', error)
    return null
  }
}

export async function hasVTOPCredentials(): Promise<boolean> {
  const saved = await getSavedVTOPCredentials()
  return saved !== null
}
