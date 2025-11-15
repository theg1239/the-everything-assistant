function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorization error</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      body {
        background: #0f172a;
        color: #e2e8f0;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }
      .card {
        max-width: 420px;
        width: 100%;
        padding: 2rem;
        border-radius: 24px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.25);
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.7);
        text-align: center;
      }
      h1 { margin-top: 0; font-size: 1.7rem; }
      p { line-height: 1.6; }
      a { color: #93c5fd; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorization failed</h1>
      <p>${message}</p>
      <p><a href="javascript:window.close()">Close this window</a></p>
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
      :root {
        color-scheme: dark;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      body {
        background: #020617;
        color: #e2e8f0;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }
      .card {
        text-align: center;
        padding: 2rem;
        border-radius: 24px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(99, 102, 241, 0.2);
        box-shadow: 0 16px 45px rgba(2, 6, 23, 0.7);
        width: min(420px, 90%);
      }
      .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(148, 163, 184, 0.2);
        border-top-color: #818cf8;
        border-radius: 50%;
        margin: 0 auto 1rem;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h1>Completing authorization…</h1>
      <p>Hang tight! We&apos;re sending you back to your MCP client.</p>
      <p>If nothing happens, <a href="${safeUrl}">click here</a>.</p>
    </div>
    <script>
      setTimeout(() => {
        try {
          window.location.replace('${safeUrl}')
        } catch (error) {
          window.location.href = '${safeUrl}'
        }
      }, 100)
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
      :root {
        color-scheme: dark;
        --bg: #020617;
        --surface: #070b1b;
        --border: rgba(255,255,255,0.07);
        --subtle: #c7d2fe;
        --muted: #8b95c5;
        --primary: #7c3aed;
        --primary-soft: rgba(124,58,237,0.18);
      }
      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f8fafc;
          --surface: #ffffff;
          --border: rgba(15,23,42,0.1);
          --subtle: #475569;
          --muted: #64748b;
          --primary: #4f46e5;
          --primary-soft: rgba(79,70,229,0.15);
        }
        body { color: #0f172a; }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg);
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(1.5rem, 4vw, 3rem);
      }
      body.light { color: #0f172a; }
      .shell {
        width: min(900px, 100%);
        min-height: min(520px, 90vh);
        border-radius: 28px;
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: 0 30px 80px rgba(0,0,0,0.35);
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        overflow: hidden;
      }
      .panel {
        padding: clamp(2rem, 5vw, 3rem);
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .panel.info {
        background: rgba(4,7,19,0.6);
        border-right: 1px solid rgba(255,255,255,0.05);
      }
      @media (prefers-color-scheme: light) {
        .panel.info { background: rgba(249,250,251,0.9); border-right: 1px solid rgba(15,23,42,0.06); }
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.4rem 1rem;
        border-radius: 999px;
        background: var(--primary-soft);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.78rem;
        color: var(--subtle);
        width: fit-content;
      }
      h1 { margin: 0; font-size: clamp(1.9rem, 3.6vw, 2.4rem); }
      .summary { margin: 0; color: var(--muted); line-height: 1.6; }
      .pill-stack { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .pill {
        padding: 0.4rem 0.9rem;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.09);
        font-size: 0.82rem;
        color: #e2e8f0;
      }
      @media (prefers-color-scheme: light) {
        .pill { color: #0f172a; border-color: rgba(15,23,42,0.1); }
      }
      .scope-card {
        margin-top: auto;
        padding: 1rem;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(5,8,20,0.75);
      }
      .scope-card ul { margin: 0.6rem 0 0 1rem; color: var(--muted); line-height: 1.45; padding: 0; }
      @media (prefers-color-scheme: light) {
        .scope-card { background: rgba(244,246,255,0.8); border-color: rgba(15,23,42,0.08); color: #0f172a; }
        .scope-card ul { color: #475569; }
      }
      form { display: flex; flex-direction: column; gap: 1rem; }
      label { font-size: 0.82rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--subtle); }
      input {
        margin-top: 0.35rem;
        width: 100%;
        padding: 0.9rem 1rem;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(0,0,0,0.35);
        color: #f8fafc;
        font-size: 1rem;
      }
      input:focus {
        outline: none;
        border-color: var(--primary);
        background: rgba(0,0,0,0.55);
        box-shadow: 0 0 0 2px rgba(124,58,237,0.25);
      }
      @media (prefers-color-scheme: light) {
        input { background: rgba(255,255,255,0.9); border-color: rgba(15,23,42,0.1); color: #0f172a; }
        input:focus { background: #ffffff; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(79,70,229,0.2); }
      }
      .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.25rem; }
      button {
        flex: 1;
        border: none;
        border-radius: 999px;
        padding: 0.95rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      button:hover { transform: translateY(-1px); }
      .primary { background: var(--primary); color: #050816; box-shadow: 0 15px 35px rgba(124,58,237,0.35); }
      .secondary { background: rgba(148,163,184,0.12); color: #e2e8f0; }
      @media (prefers-color-scheme: light) {
        .primary { color: #ffffff; }
        .secondary { background: rgba(15,23,42,0.05); color: #0f172a; }
      }
      .help { margin-top: auto; font-size: 0.85rem; color: var(--muted); line-height: 1.5; }
      @media (max-width: 900px) {
        .shell { grid-template-columns: 1fr; min-height: unset; }
        .panel.info { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .help { margin-top: 1.5rem; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="panel info">
        <span class="eyebrow">VTOP secure authorization</span>
        <h1>Authorize ${appName}</h1>
        <p class="summary">
          Grant this client secure access to Everything Assistant&apos;s VTOP proxy. We encrypt your credentials locally and only store the cipher inside this OAuth session.
        </p>
        <div class="pill-stack">
          <div class="pill">Scope · ${scopeList}</div>
          <div class="pill">Callback · ${redirectHost || 'custom'}</div>
        </div>
        <div class="scope-card">
          <strong>This client can:</strong>
          <ul>
            <li>Run VTOP-safe commands through Everything Assistant</li>
            <li>Download attendance, grades, timetable & materials</li>
            <li>Display the results directly in your MCP UI</li>
          </ul>
        </div>
      </section>
      <section class="panel">
        <form method="post" action="/oauth/consent">
          <input type="hidden" name="consent_token" value="${consentToken}" />
          <label for="username">VTOP username
            <input id="username" name="username" type="text" autocomplete="username" required placeholder="e.g. 23BCE0000" />
          </label>
          <label for="password">VTOP password
            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password" />
          </label>
          <div class="actions">
            <button type="submit" class="primary">Authorize & Continue</button>
            <button type="submit" name="cancel" value="true" class="secondary">Cancel</button>
          </div>
        </form>
        <p class="help">
          We generate a one-time session key, encrypt your password on this screen, and only forward the cipher to the proxy. You can revoke access any time from your MCP client or Everything Assistant settings → VTOP integration.
        </p>
      </section>
    </div>
  </body>
</html>`
}

module.exports = {
  renderErrorPage,
  renderSuccessRedirectPage,
  renderConsentPage,
}
