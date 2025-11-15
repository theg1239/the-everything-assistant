const CryptoJS = require('crypto-js')

function decryptPassword(encryptedData, sessionKey) {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, sessionKey).toString(CryptoJS.enc.Utf8)
    if (!decrypted) {
      throw new Error('Decryption resulted in empty string')
    }
    return decrypted
  } catch (error) {
    console.error('[security] Decryption error, treating as plain text')
    return encryptedData
  }
}

module.exports = {
  decryptPassword,
}
