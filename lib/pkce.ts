import crypto from 'crypto'

export function generatePkcePair() {
  const verifier = base64UrlEncode(crypto.randomBytes(32))
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
