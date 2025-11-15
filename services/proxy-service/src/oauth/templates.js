const BASE_STYLES = `
  :root {
    color-scheme: dark;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  @media (prefers-color-scheme: light) {
    :root { color-scheme: light; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: #020617;
    color: #e2e8f0;
  }
  @media (prefers-color-scheme: light) {
    body { background: #f8fafc; color: #0f172a; }
  }
  .card {
    width: 100%;
    max-width: 460px;
    border-radius: 16px;
    padding: 1.75rem 1.5rem 1.5rem;
    background: #020618;
    border: 1px solid rgba(148,163,184,0.35);
  }
  @media (prefers-color-scheme: light) {
    .card {
      background: #ffffff;
      border-color: rgba(148,163,184,0.55);
    }
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.35rem;
    font-weight: 600;
  }
  p {
    margin: 0.25rem 0;
    line-height: 1.5;
    font-size: 0.95rem;
  }
  .muted { color: #94a3b8; }
  @media (prefers-color-scheme: light) {
    .muted { color: #6b7280; }
  }
`

function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorization error</title>
    <style>
${BASE_STYLES}
      a { color: #60a5fa; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorization failed</h1>
      <p class="muted">${message}</p>
      <p style="margin-top:1rem;"><a href="javascript:window.close()">Close this window</a></p>
    </div>
  </body>
</html>`
}

function renderSuccessRedirectPage(redirectUrl) {
  const safeUrl = redirectUrl.replace(/"/g, '&quot;')
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${safeUrl}" />
    <title>Completing authorization…</title>
    <style>
${BASE_STYLES}
      a { color: #60a5fa; text-decoration: none; }
      .spinner {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: 3px solid rgba(148,163,184,0.4);
        border-top-color: #818cf8;
        margin-bottom: 0.75rem;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="card" style="text-align:center;">
      <div class="spinner"></div>
      <h1>Completing authorization…</h1>
      <p class="muted">We&apos;re sending you back to your MCP client.</p>
      <p style="margin-top:0.75rem; font-size:0.9rem;">If nothing happens, <a href="${safeUrl}">click here</a>.</p>
    </div>
    <script>
      setTimeout(() => {
        try { window.location.replace('${safeUrl}'); } catch (e) { window.location.href = '${safeUrl}'; }
      }, 100);
    </script>
  </body>
</html>`
}

function renderConsentPage({ consentToken, appName, scopeList, redirectHost }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${appName}</title>
    <style>
${BASE_STYLES}
      .label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 0.25rem; }
      @media (prefers-color-scheme: light) { .label { color: #6b7280; } }
      input {
        width: 100%;
        padding: 0.7rem 0.75rem;
        border-radius: 10px;
        border: 1px solid rgba(148,163,184,0.6);
        font-size: 0.95rem;
        background: transparent;
        color: inherit;
      }
      input:focus {
        outline: none;
        border-color: #6366f1;
        box-shadow: 0 0 0 1px rgba(99,102,241,0.35);
      }
      .field { margin-top: 0.85rem; }
      .meta { font-size: 0.85rem; margin-top: 0.75rem; }
      .meta span { display: inline-block; margin-right: 0.75rem; color: #94a3b8; }
      @media (prefers-color-scheme: light) { .meta span { color: #6b7280; } }
      .actions { display: flex; gap: 0.6rem; margin-top: 1rem; }
      button {
        flex: 1;
        border-radius: 999px;
        border: none;
        padding: 0.7rem 0.9rem;
        font-size: 0.95rem;
        font-weight: 500;
        cursor: pointer;
      }
      .primary { background: #4f46e5; color: #f9fafb; }
      .secondary { background: transparent; border: 1px solid rgba(148,163,184,0.6); color: inherit; }
      .hint { margin-top: 0.85rem; font-size: 0.82rem; color: #94a3b8; }
      @media (prefers-color-scheme: light) { .hint { color: #6b7280; } }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorize ${appName}</h1>
      <p class="muted">Let this client run VTOP actions through Everything Assistant.</p>
      <div class="meta">
        <span>Scope: ${scopeList}</span>
        <span>Callback: ${redirectHost}</span>
      </div>
      <form method="post" action="/oauth/consent" style="margin-top:1rem;">
        <input type="hidden" name="consent_token" value="${consentToken}" />
        <div class="field">
          <div class="label">VTOP username</div>
          <input id="username" name="username" type="text" autocomplete="username" required placeholder="e.g. 23BCE0000" />
        </div>
        <div class="field">
          <div class="label">VTOP password</div>
          <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password" />
        </div>
        <div class="actions">
          <button type="submit" class="primary">Authorize</button>
          <button type="submit" name="cancel" value="true" class="secondary">Cancel</button>
        </div>
      </form>
      <p class="hint">
        Your password is encrypted locally with a one-time key and only the encrypted form is stored with this OAuth token.
      </p>
    </div>
  </body>
</html>`
}

module.exports = {
  renderErrorPage,
  renderSuccessRedirectPage,
  renderConsentPage,
}

