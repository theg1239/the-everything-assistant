import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkMCPServerUrl,
  isBlockedIpAddress,
  sanitizeMCPHeaders,
} from '../lib/mcp-url-policy'

test('isBlockedIpAddress flags private/loopback/link-local/CGNAT/metadata IPv4', () => {
  for (const ip of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ]) {
    assert.equal(isBlockedIpAddress(ip), true, ip)
  }
})

test('isBlockedIpAddress allows public IPv4', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '100.63.255.255', '100.128.0.1', '172.32.0.1', '172.15.255.255']) {
    assert.equal(isBlockedIpAddress(ip), false, ip)
  }
})

test('isBlockedIpAddress flags reserved IPv6 including IPv4-embedded forms', () => {
  for (const ip of [
    '::',
    '::1',
    '[::1]',
    'fd00::1',
    'fc00::1',
    'fe80::1',
    'febf::1',
    'fec0::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '[::ffff:a9fe:a9fe]', // ::ffff:169.254.169.254
    '::ffff:10.0.0.1',
    '::127.0.0.1',
    '64:ff9b::a9fe:a9fe', // NAT64 of 169.254.169.254
    '2002:7f00:1::', // 6to4 of 127.0.0.1
    '2001::1', // Teredo
    '2001:db8::1',
    '0:0:0:0:0:0:0:1',
  ]) {
    assert.equal(isBlockedIpAddress(ip), true, ip)
  }
})

test('isBlockedIpAddress allows public IPv6', () => {
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808']) {
    assert.equal(isBlockedIpAddress(ip), false, ip)
  }
})

test('checkMCPServerUrl accepts public https URLs', () => {
  for (const url of [
    'https://mcp.example.com/sse',
    'https://mcp.example.com:8443/mcp',
    'https://8.8.8.8/mcp',
    'https://[2606:4700:4700::1111]/mcp',
  ]) {
    const result = checkMCPServerUrl(url)
    assert.equal(result.ok, true, url)
  }
})

test('checkMCPServerUrl rejects non-https, credentials and internal targets', () => {
  for (const url of [
    'http://mcp.example.com/sse',
    'ftp://mcp.example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    'https://user:pass@mcp.example.com/',
    'https://localhost/mcp',
    'https://foo.localhost/mcp',
    'https://127.0.0.1/mcp',
    'https://2130706433/mcp', // decimal 127.0.0.1
    'https://0x7f.1/mcp', // hex/short form of 127.0.0.1
    'https://0177.0.0.1/mcp', // octal 127.0.0.1
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/mcp',
    'https://[::ffff:127.0.0.1]/mcp',
    'https://[fd00::1]/mcp',
    'https://[fe80::1]/mcp',
    'https://10.0.0.5/mcp',
    'https://100.64.1.1/mcp',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://metadata/computeMetadata/v1/',
    'https://instance-data/latest/',
    'https://printer.local/',
    'https://intranet/',
    'https://svc.cluster.local/',
  ]) {
    const result = checkMCPServerUrl(url)
    assert.equal(result.ok, false, url)
  }
})

test('checkMCPServerUrl allows http localhost only when explicitly enabled', () => {
  assert.equal(checkMCPServerUrl('http://localhost:3001/mcp').ok, false)
  assert.equal(checkMCPServerUrl('http://localhost:3001/mcp', { allowLocalhost: true }).ok, true)
  assert.equal(checkMCPServerUrl('http://127.0.0.1:3001/mcp', { allowLocalhost: true }).ok, true)
  assert.equal(checkMCPServerUrl('http://[::1]:3001/mcp', { allowLocalhost: true }).ok, true)
  // The dev exemption is only for loopback, not for other private hosts.
  assert.equal(checkMCPServerUrl('http://10.0.0.1/mcp', { allowLocalhost: true }).ok, false)
})

test('sanitizeMCPHeaders drops hop-by-hop, routing and cookie headers', () => {
  assert.deepEqual(
    sanitizeMCPHeaders({
      Authorization: 'Bearer abc',
      'X-Api-Key': 'k',
      Host: 'internal.example',
      Connection: 'close',
      'Transfer-Encoding': 'chunked',
      'X-Forwarded-For': '127.0.0.1',
      'X-Forwarded-Host': 'internal',
      Cookie: 'session=1',
      'CF-Connecting-IP': '1.2.3.4',
      'X-Injected': 'a\r\nHost: evil',
      'Bad Header': 'x',
    }),
    { Authorization: 'Bearer abc', 'X-Api-Key': 'k' }
  )
  assert.equal(sanitizeMCPHeaders(undefined), undefined)
  assert.equal(sanitizeMCPHeaders({ Cookie: 'a=1' }), undefined)
})
