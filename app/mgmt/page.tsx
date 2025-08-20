import ManagementClient from './management-client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/* ────────────────────────────────────────────────────────────────
   Types (kept so your file compiles if imported elsewhere)
────────────────────────────────────────────────────────────────── */
type UsageLog = {
  id: string
  userId?: string | null
  chatId?: string | null
  model?: string | null
  stepIndex?: number | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: string
}

interface RateLimitStatus {
  status: string
  timestamp: string
  environment: {
    validation: { isValid: boolean; errors: string[]; warnings: string[] }
    summary: { hasRedis: boolean; apiKeys: { totalAvailable: number }; adminAccess: { email: string } }
  }
  configuration: {
    apiKeys: {
      enableRotation: boolean
      rotateOnRateLimit: boolean
      keyCount: number
      rateLimit: { requestsPerMinute: number; requestsPerHour: number }
      retryConfig: { maxRetries: number; baseDelay: number; maxDelay: number }
      keyHealthCheckInterval: number
    }
    userRateLimit: { enabled: boolean; requestsPerMinute: number; requestsPerHour: number; requestsPerDay: number }
  }
  keyUsage: {
    [keyIndex: string]: {
      requests: number
      failures: number
      lastUsed: number | null
      lastFailed: number | null
      availableTokens: { minute: number; hour: number; day: number }
      isRateLimited: boolean
      isCurrent: boolean
    }
  }
  healthCheck: { redis: string; apiKeys: string }
}

interface Stats {
  totalUsers: number
  messagesInLast30Minutes: number
  toolCallStats: { toolName: string; count: number }[]
}

interface BroadcastSlide {
  title: string
  text: string
  image: string
}

interface PastBroadcast {
  id: string
  slides: BroadcastSlide[]
  timestamp: string
  sentBy: string
}

/* ────────────────────────────────────────────────────────────────
   Goofy visual helpers (SSR-only, zero client JS)
────────────────────────────────────────────────────────────────── */
const EMOJI_SET_NEAR = ['🤡','🦄','🪄','🌈','🥳','🍩','☕','🛸','👾','🧪']
const EMOJI_SET_FAR  = ['🐄','🐥','💥','🍕','🧃','🍌','🧨','🌀','🐸','🪅']

function makeDrops(count: number, emojis: string[]) {
  return Array.from({ length: count }, (_, i) => {
    const left = Math.floor(Math.random() * 100)
    const delay = (Math.random() * -12).toFixed(2)
    const duration = (7 + Math.random() * 10).toFixed(2)
    const size = 16 + Math.floor(Math.random() * 28)
    const emoji = emojis[i % emojis.length]
    const rotate = -30 + Math.floor(Math.random() * 60)
    const blur = Math.random() > 0.6 ? 'blur(1px)' : 'none'
    const opacity = (0.6 + Math.random() * 0.4).toFixed(2)
    return { left, delay, duration, size, emoji, rotate, blur, opacity }
  })
}

function EmojiRain({ countNear = 38, countFar = 26 }: { countNear?: number; countFar?: number }) {
  const near = makeDrops(countNear, EMOJI_SET_NEAR)
  const far  = makeDrops(countFar, EMOJI_SET_FAR)

  return (
    <>
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-12vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(115vh) rotate(360deg); opacity: 0.85; }
        }
        .unhinged-halo {
          background:
            radial-gradient(60% 60% at 50% 40%, rgba(236,72,153,.25), transparent 60%),
            conic-gradient(from 180deg at 50% 50%, rgba(14,165,233,.22), rgba(168,85,247,.22), rgba(236,72,153,.22), rgba(14,165,233,.22));
          filter: blur(40px);
        }
        .grid-warp {
          background-image:
            linear-gradient(to right, rgba(255,255,255,.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,.06) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(ellipse at center, rgba(0,0,0,1), rgba(0,0,0,0) 70%);
          transform: perspective(800px) rotateX(55deg) translateY(-10%);
        }
        .glitch {
          position: relative;
          text-shadow:
            0.03em 0 0 rgba(255,0,0,.7),
            -0.02em -0.03em 0 rgba(0,255,255,.7);
          animation: glitchy 2.5s infinite;
        }
        @keyframes glitchy {
          0% { transform: translate(0) }
          10% { transform: translate(1px,-1px) }
          20% { transform: translate(-1px,1px) }
          30% { transform: translate(1px,0) }
          40% { transform: translate(0,1px) }
          50% { transform: translate(-1px,0) }
          60% { transform: translate(0,-1px) }
          100% { transform: translate(0) }
        }
        .ticker {
          animation: ticker-move 18s linear infinite;
          white-space: nowrap;
        }
        @keyframes ticker-move {
          0% { transform: translateX(0) }
          100% { transform: translateX(-50%) }
        }
        .wobble:hover { transform: rotate(-1deg) translateY(-2px) scale(1.01); }
        .crt {
          background: radial-gradient(ellipse at center, rgba(255,255,255,.05), rgba(0,0,0,.15));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
        }
      `}</style>

      {/* FAR LAYER */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {far.map((d, idx) => (
          <span
            key={`far-${idx}`}
            aria-hidden
            style={{
              left: `${d.left}%`,
              animation: `fall ${d.duration}s linear infinite`,
              animationDelay: `${d.delay}s`,
              fontSize: `${Math.max(12, d.size - 8)}px`,
              transform: `rotate(${d.rotate}deg)`,
              filter: d.blur,
              opacity: d.opacity as any,
            }}
            className="absolute top-0 select-none"
          >
            {d.emoji}
          </span>
        ))}
      </div>

      {/* NEAR LAYER */}
      <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
        {near.map((d, idx) => (
          <span
            key={`near-${idx}`}
            aria-hidden
            style={{
              left: `${d.left}%`,
              animation: `fall ${d.duration}s linear infinite`,
              animationDelay: `${d.delay}s`,
              fontSize: `${d.size}px`,
              transform: `rotate(${d.rotate}deg)`,
              opacity: d.opacity as any,
            }}
            className="absolute top-0 select-none"
          >
            {d.emoji}
          </span>
        ))}
      </div>
    </>
  )
}

function HaloBG() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-24 left-1/2 h-[60vmax] w-[60vmax] -translate-x-1/2 rounded-full unhinged-halo opacity-60" />
      <div className="grid-warp absolute bottom-[-30%] left-[-10%] right-[-10%] top-1/3" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,.06),transparent_60%)]" />
    </div>
  )
}

function AsciiCow({ small = false }: { small?: boolean }) {
  const art = small
    ? String.raw`
  ^__^
  (oo)\_______
  (__)\       )\/\
      ||----w |
      ||     ||
`
    : String.raw`
          \   ^__^
           \  (oo)\_______
              (__)\       )\/\
                  ||----w |
                  ||     ||
`
  return (
    <pre className="mt-5 w-full overflow-x-auto rounded-md bg-muted/40 p-4 text-xs leading-4 text-muted-foreground">
      {art}
    </pre>
  )
}

function Marquee({ text }: { text: string }) {
  return (
    <div className="relative mx-auto mt-4 w-full overflow-hidden rounded-md border border-dashed border-muted-foreground/30 bg-card/60 py-1">
      <div className="ticker flex gap-8 px-4 text-[11px] sm:text-xs lowercase text-muted-foreground">
        <span>{text}</span>
        <span>{text}</span>
        <span>{text}</span>
        <span>{text}</span>
      </div>
    </div>
  )
}

function BigButton({
  label,
  subtitle,
  href,
  variant = 'primary',
}: {
  label: string
  subtitle?: string
  href?: string
  variant?: 'primary' | 'danger' | 'ghost'
}) {
  const base =
    'group relative flex w-full items-center justify-between rounded-md px-4 py-3 text-left transition wobble'
  const variants = {
    primary:
      'bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white hover:from-fuchsia-600 hover:to-rose-600 shadow-lg shadow-fuchsia-500/20',
    danger:
      'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/20',
    ghost:
      'border border-dashed border-muted-foreground/40 bg-card/70 text-foreground hover:bg-card/90',
  } as const
  const Cmp = href ? 'a' : 'button'
  return (
    <Cmp href={href} className={`${base} ${variants[variant]}`}>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{label}</span>
        {subtitle ? (
          <span className="truncate text-[11px] opacity-80">{subtitle}</span>
        ) : null}
      </div>
      <span aria-hidden className="ml-3 text-xl transition group-hover:scale-110">🪄</span>
    </Cmp>
  )
}

function CRTPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="crt rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <span aria-hidden className="text-[10px]">● ● ●</span>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-5">
        {lines.join('\n')}
      </pre>
    </div>
  )
}

function WobbleCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-lg transition hover:shadow-xl">
      <div className="mb-2 text-sm font-semibold lowercase">{title}</div>
      <div className="text-xs text-muted-foreground">{children}</div>
    </div>
  )
}

function Wall({
  title,
  blurb,
  checklist,
  footer,
  adminEmail,
}: {
  title: string
  blurb: string
  checklist: string[]
  footer?: string
  adminEmail: string
}) {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-start gap-6 px-4 py-8 sm:py-12 lg:py-16">
      <HaloBG />
      <EmojiRain />

      <div className="relative mx-auto w-full max-w-3xl text-center">
        <h1 className="glitch bg-gradient-to-r from-pink-600 via-violet-600 to-sky-600 bg-clip-text text-3xl font-extrabold lowercase text-transparent sm:text-4xl md:text-5xl">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground sm:text-sm md:text-base lowercase">
          {blurb}
        </p>
        <AsciiCow />
      </div>

      <Marquee text="warning: unauthorized vibes detected • tip: never deploy on fridays • rubber chickens neutralize rate limits • hydrate now • touch grass • semicolons are optional (no they aren’t)" />

      <section className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WobbleCard title="ritual checklist">
          <ul className="list-disc pl-4">
            {checklist.map((c, i) => (
              <li key={i} className="mb-1 lowercase">
                {c}
              </li>
            ))}
          </ul>
        </WobbleCard>

        <WobbleCard title="random vibe check">
          <div className="flex flex-wrap gap-2 text-base">
            <span aria-hidden>🪅</span>
            <span aria-hidden>🛸</span>
            <span aria-hidden>🍩</span>
            <span aria-hidden>🧪</span>
            <span aria-hidden>🤡</span>
            <span aria-hidden>🐄</span>
            <span aria-hidden>🌈</span>
            <span aria-hidden>🦄</span>
            <span aria-hidden>💥</span>
            <span aria-hidden>👾</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            results: **unhinged**. proceed with sparkles.
          </p>
        </WobbleCard>

        <CRTPanel
          title="red alert terminal"
          lines={[
            '>$ checking_admin_credentials … FAILED',
            '>$ recalibrating_neon_grid … OK',
            '>$ deploying_confetti_driver … OK',
            '>$ contacting_rubber_chicken … VOICEMAIL',
            '>$ escalating_to_goose_council … HONK PENDING',
          ]}
        />
      </section>

      <section className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
        <BigButton
          label="summon admin"
          subtitle="opens sacred email portal"
          href={`mailto:jobs@vimegle.com?subject=grant%20me%20the%20powers`}
          variant="primary"
        />
        <BigButton label="try login ritual" subtitle="you might be the chosen one" href="/api/auth/signin" variant="ghost" />
        <BigButton label="open portal of chaos" subtitle="definitely do not press" href="#" variant="danger" />
        <BigButton label="summon rubber chicken" subtitle="bonk rate limits away" href="#" variant="ghost" />
      </section>

      {footer ? (
        <p className="mt-4 px-4 text-center text-[11px] text-muted-foreground lowercase">{footer}</p>
      ) : null}

      <footer className="mt-8 w-full max-w-4xl rounded-md border border-dashed border-muted-foreground/30 bg-card/70 p-3">
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="text-[11px] lowercase text-muted-foreground">
            disclaimer: all cows depicted are professionals on a closed course. 🐄
          </div>
          <div className="flex items-center gap-2 text-lg" aria-hidden>
            <span>🌀</span>
            <span>🍕</span>
            <span>🧃</span>
          </div>
        </div>
      </footer>
    </main>
  )
}

/* ────────────────────────────────────────────────────────────────
   Page (auth logic unchanged)
────────────────────────────────────────────────────────────────── */
export default async function ManagementPage() {
  const session = await getServerSession(authOptions)
  const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL ?? 'admin@example.com'

  if (!process.env.RATE_LIMIT_ADMIN_EMAIL) {
    return (
      <Wall
        adminEmail={adminEmail}
        title={'oopsie-daisy! admin not found (503)'}
        blurb={[
          'the council of ducks reviewed your request and decreed:',
          '"needs admin vibes."',
          '',
          'to appease the ducks, set RATE_LIMIT_ADMIN_EMAIL in your env,',
          'preferably while wearing sunglasses indoors. 😎',
        ].join('\n')}
        checklist={[
          'locate your .env like it’s a rare pokemon',
          'add RATE_LIMIT_ADMIN_EMAIL=you@really.cool',
          'restart dev server with jazz hands',
          'refresh page and shout “enhance!”',
        ]}
        footer={'pro tip: coffee + donuts increase admin spawn rate by 9000%. 🍩☕'}
      />
    )
  }

  if (!session?.user?.email || session.user.email !== adminEmail) {
    return (
      <Wall
        adminEmail={adminEmail}
        title={'nice try, keyboard ninja (403)'}
        blurb={[
          'you do not possess the sacred admin amulet.',
          'to earn it, pass three trials:',
          '1) never deploy on friday,',
          '2) tame the mysterious eslint,',
          '3) name things better than "utils.ts".',
        ].join('\n')}
        checklist={[
          `be the admin`,
          'verify your email like a responsible wizard',
          'whisper to the rubber chicken for moral support',
          'press “try login ritual” and hope for sparkles',
        ]}
        footer={'imaginary confetti deployed. if you saw nothing, your gpu is shy. 🎉'}
      />
    )
  }

  return <ManagementClient />
}
