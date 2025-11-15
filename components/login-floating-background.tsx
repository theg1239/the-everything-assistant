'use client'

import FloatingLines from '@/components/backgrounds/floating-lines'

type LoginFloatingBackgroundProps = {
  children: React.ReactNode
}

export function LoginFloatingBackground({ children }: LoginFloatingBackgroundProps) {
  return (
    <div className="relative min-h-screen bg-[#05060b] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-90">
        <FloatingLines
          linesGradient={["#8b5cf6", "#0ea5e9", "#14b8a6"]}
          lineCount={[8, 6, 4]}
          lineDistance={[6, 8, 10]}
          animationSpeed={1.2}
          parallaxStrength={0.35}
        />
      </div>
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">{children}</div>
    </div>
  )
}
