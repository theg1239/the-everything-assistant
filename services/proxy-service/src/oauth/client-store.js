const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { InvalidRequestError } = require('@modelcontextprotocol/sdk/server/auth/errors.js')

class InMemoryClientsStore {
  constructor(initialClients = []) {
    this.clients = new Map()
    initialClients.forEach(client => {
      if (client?.client_id) {
        this.clients.set(client.client_id, client)
      }
    })
  }

  async getClient(clientId) {
    return this.clients.get(clientId)
  }

  async registerClient(clientMetadata) {
    if (!clientMetadata.redirect_uris || clientMetadata.redirect_uris.length === 0) {
      throw new InvalidRequestError('Client registration requires at least one redirect_uri')
    }

    const clientId = clientMetadata.client_id || randomUUID()
    const registered = {
      ...clientMetadata,
      client_id: clientId,
    }

    this.clients.set(clientId, registered)
    return registered
  }
}

class FileBackedClientsStore extends InMemoryClientsStore {
  constructor(filePath, initialClients = []) {
    super([])
    this.filePath = filePath
    this._loadFromDisk()
    initialClients.forEach(client => {
      if (client?.client_id && !this.clients.has(client.client_id)) {
        this.clients.set(client.client_id, client)
      }
    })
    if (!fs.existsSync(this.filePath)) {
      this._persist()
    }
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return
      }
      const contents = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(contents)
      if (Array.isArray(parsed)) {
        this.clients = new Map(parsed.map(client => [client.client_id, client]))
      }
    } catch (error) {
      console.warn('[oauth] Failed to read clients store, falling back to empty store:', error.message)
      this.clients = new Map()
    }
  }

  _persist() {
    try {
      const dir = path.dirname(this.filePath)
      fs.mkdirSync(dir, { recursive: true })
      const serialized = JSON.stringify(Array.from(this.clients.values()), null, 2)
      fs.writeFileSync(this.filePath, serialized, 'utf-8')
    } catch (error) {
      console.error('[oauth] Failed to persist clients store:', error.message)
    }
  }

  async registerClient(clientMetadata) {
    const registered = await super.registerClient(clientMetadata)
    this._persist()
    return registered
  }
}

function createClientsStore({ staticClients = [], clientsFilePath } = {}) {
  if (clientsFilePath) {
    return new FileBackedClientsStore(clientsFilePath, staticClients)
  }
  return new InMemoryClientsStore(staticClients)
}

module.exports = {
  createClientsStore,
}
