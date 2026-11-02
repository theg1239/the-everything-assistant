'use strict'

/** Makes the relative /files URLs in a result absolute for the caller. */
function absolutize(result, base) {
  if (!base || !result || typeof result !== 'object') return result
  const fix = url => (typeof url === 'string' && url.startsWith('/') ? `${base}${url}` : url)
  const out = { ...result }
  if (Array.isArray(out.files)) out.files = out.files.map(file => ({ ...file, url: fix(file.url) }))
  if (out.bundle) out.bundle = { ...out.bundle, url: fix(out.bundle.url) }
  if (out.downloadInfo && Array.isArray(out.downloadInfo.servedFiles)) {
    out.downloadInfo = {
      ...out.downloadInfo,
      servedFiles: out.downloadInfo.servedFiles.map(file => ({ ...file, downloadUrl: fix(file.downloadUrl) })),
      ...(out.downloadInfo.bundle ? { bundle: { ...out.downloadInfo.bundle, url: fix(out.downloadInfo.bundle.url) } } : {}),
    }
  }
  if (out.result) out.result = absolutize(out.result, base)
  return out
}

module.exports = { absolutize }
