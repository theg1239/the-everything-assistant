const { decryptPassword } = require('./security')

function resolvePassword({ password, encryptedPassword, sessionKey }) {
  if (password && typeof password === 'string') {
    return password
  }

  if (encryptedPassword && sessionKey) {
    return decryptPassword(encryptedPassword, sessionKey)
  }

  throw new Error('Missing credentials: provide password or encryptedPassword + sessionKey')
}

module.exports = {
  resolvePassword,
}
