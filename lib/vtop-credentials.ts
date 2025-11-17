import CryptoJS from 'crypto-js'

interface SavedVTOPCredentials {
  username: string
  encryptedPassword: string
  timestamp: number
}

const COOKIE_NAME = 'vtop_linked_credentials'
const ENCRYPTION_KEY_COOKIE = 'vtop_master_key'

function cookieFlags() {
  const isSecure = typeof window !== 'undefined' && window.location?.protocol === 'https:'
  return `path=/;samesite=strict${isSecure ? ';secure' : ''}`
}

function setCookie(name: string, value: string, days: number = 30) {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};${cookieFlags()}`
}

function getCookie(name: string): string | null {
  const nameEQ = name + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length))
  }
  return null
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;${cookieFlags()}`
}

function getMasterKey(): string {
  let masterKey = getCookie(ENCRYPTION_KEY_COOKIE)
  if (!masterKey) {
    masterKey = CryptoJS.lib.WordArray.random(256 / 8).toString()
    setCookie(ENCRYPTION_KEY_COOKIE, masterKey, 365)
  }
  return masterKey
}

export function saveVTOPCredentials(username: string, password: string): void {
  try {
    const masterKey = getMasterKey()
    const encryptedPassword = CryptoJS.AES.encrypt(password, masterKey).toString()

    const credentials: SavedVTOPCredentials = {
      username,
      encryptedPassword,
      timestamp: Date.now(),
    }

    setCookie(COOKIE_NAME, JSON.stringify(credentials), 90)
  } catch (error) {
    console.error('Failed to save VTOP credentials:', error)
    throw new Error('Failed to save credentials')
  }
}

export function getSavedVTOPCredentials(): SavedVTOPCredentials | null {
  try {
    const stored = getCookie(COOKIE_NAME)
    if (!stored) return null

    return JSON.parse(stored)
  } catch (error) {
    console.error('Failed to retrieve VTOP credentials:', error)
    return null
  }
}

export function getDecryptedVTOPCredentials(): { username: string; password: string } | null {
  try {
    const saved = getSavedVTOPCredentials()
    if (!saved) return null

    const masterKey = getMasterKey()
    const decryptedPassword = CryptoJS.AES.decrypt(saved.encryptedPassword, masterKey).toString(
      CryptoJS.enc.Utf8
    )

    if (!decryptedPassword) {
      clearSavedVTOPCredentials()
      return null
    }

    return {
      username: saved.username,
      password: decryptedPassword,
    }
  } catch (error) {
    console.error('Failed to decrypt VTOP credentials:', error)
    clearSavedVTOPCredentials()
    return null
  }
}

export function getFormattedVTOPCredentials(): {
  username: string
  encryptedPassword: string
} | null {
  try {
    const decrypted = getDecryptedVTOPCredentials()
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

export function hasVTOPCredentials(): boolean {
  return getSavedVTOPCredentials() !== null
}

export function clearSavedVTOPCredentials(): void {
  try {
    deleteCookie(COOKIE_NAME)
    deleteCookie(ENCRYPTION_KEY_COOKIE)
  } catch (error) {
    console.error('Failed to clear VTOP credentials:', error)
  }
}

export function validateSavedCredentials(): boolean {
  try {
    const decrypted = getDecryptedVTOPCredentials()
    return decrypted !== null && decrypted.username.length > 0 && decrypted.password.length > 0
  } catch (error) {
    return false
  }
}
