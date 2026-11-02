import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

type ColorBendsProps = {
  className?: string
  style?: React.CSSProperties
  rotation?: number
  speed?: number
  colors?: string[]
  transparent?: boolean
  autoRotate?: number
  scale?: number
  frequency?: number
  warpStrength?: number
  mouseInfluence?: number
  parallax?: number
  noise?: number
}

const MAX_COLORS = 8 as const

const frag = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer; // in NDC [-1,1]
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

    vec3 col = vec3(0.0);
    float a = 1.0;

    if (uColorCount > 0) {
      vec2 s = q;
      vec3 sumCol = vec3(0.0);
      float cover = 0.0;
      for (int i = 0; i < MAX_COLORS; ++i) {
            if (i >= uColorCount) break;
            s -= 0.01;
            vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
            float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
            float kBelow = clamp(uWarpStrength, 0.0, 1.0);
            float kMix = pow(kBelow, 0.3); // strong response across 0..1
            float gain = 1.0 + max(uWarpStrength - 1.0, 0.0); // allow >1 to amplify displacement
            vec2 disp = (r - s) * kBelow;
            vec2 warped = s + disp * gain;
            float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
            float m = mix(m0, m1, kMix);
            float w = 1.0 - exp(-6.0 / exp(6.0 * m));
            sumCol += uColors[i] * w;
            cover = max(cover, w);
      }
      col = clamp(sumCol, 0.0, 1.0);
      a = uTransparent > 0 ? cover : 1.0;
    } else {
        vec2 s = q;
        for (int k = 0; k < 3; ++k) {
            s -= 0.01;
            vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
            float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
            float kBelow = clamp(uWarpStrength, 0.0, 1.0);
            float kMix = pow(kBelow, 0.3);
            float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
            vec2 disp = (r - s) * kBelow;
            vec2 warped = s + disp * gain;
            float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
            float m = mix(m0, m1, kMix);
            col[k] = 1.0 - exp(-6.0 / exp(6.0 * m));
        }
        a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
    }

    if (uNoise > 0.0001) {
      float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
      col += (n - 0.5) * uNoise;
      col = clamp(col, 0.0, 1.0);
    }

    vec3 rgb = (uTransparent > 0) ? col * a : col;
    gl_FragColor = vec4(rgb, a);
}
`

const vert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

function createColorBandsUniforms(params: {
  speed: number
  transparent: boolean
  scale: number
  frequency: number
  warpStrength: number
  mouseInfluence: number
  parallax: number
  noise: number
}) {
  return {
    uCanvas: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uSpeed: { value: params.speed },
    uRot: { value: new THREE.Vector2(1, 0) },
    uColorCount: { value: 0 },
    uColors: { value: Array.from({ length: MAX_COLORS }, () => new THREE.Vector3(0, 0, 0)) },
    uTransparent: { value: params.transparent ? 1 : 0 },
    uScale: { value: params.scale },
    uFrequency: { value: params.frequency },
    uWarpStrength: { value: params.warpStrength },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uMouseInfluence: { value: params.mouseInfluence },
    uParallax: { value: params.parallax },
    uNoise: { value: params.noise },
  }
}

type ColorBandsUniforms = ReturnType<typeof createColorBandsUniforms>

const hexPairToByte = (h: string, start: number) => parseInt(h.slice(start, start + 2), 16)

export default function ColorBends({
  className,
  style,
  rotation = 45,
  speed = 0.2,
  colors = [],
  transparent = true,
  autoRotate = 0,
  scale = 1,
  frequency = 1,
  warpStrength = 1,
  mouseInfluence = 1,
  parallax = 0.5,
  noise = 0.1,
}: ColorBendsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const rafRef = useRef<number | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  // Same object as materialRef.current.uniforms (ShaderMaterial keeps the reference), but typed.
  const uniformsRef = useRef<ColorBandsUniforms | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const rotationRef = useRef<number>(rotation)
  const autoRotateRef = useRef<number>(autoRotate)
  const pointerTargetRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0))
  const pointerCurrentRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0))
  const pointerSmoothRef = useRef<number>(8)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const geometry = new THREE.PlaneGeometry(2, 2)
    const uniforms = createColorBandsUniforms({
      speed,
      transparent,
      scale,
      frequency,
      warpStrength,
      mouseInfluence,
      parallax,
      noise,
    })
    const material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      premultipliedAlpha: true,
      transparent: true,
    })
    materialRef.current = material
    uniformsRef.current = uniforms

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: true,
    })
    rendererRef.current = renderer
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, transparent ? 0 : 1)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)

    const clock = new THREE.Clock()

    const handleResize = () => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      renderer.setSize(w, h, false)
      uniforms.uCanvas.value.set(w, h)
    }

    handleResize()

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(handleResize)
      ro.observe(container)
      resizeObserverRef.current = ro
    } else {
      // TS narrows `window` to never here since lib.dom always declares ResizeObserver.
      ;(window as Window).addEventListener('resize', handleResize)
    }

    const loop = () => {
      const dt = clock.getDelta()
      const elapsed = clock.elapsedTime
      uniforms.uTime.value = elapsed

      const deg = (rotationRef.current % 360) + autoRotateRef.current * elapsed
      const rad = (deg * Math.PI) / 180
      const c = Math.cos(rad)
      const s = Math.sin(rad)
      uniforms.uRot.value.set(c, s)

      const cur = pointerCurrentRef.current
      const tgt = pointerTargetRef.current
      const amt = Math.min(1, dt * pointerSmoothRef.current)
      cur.lerp(tgt, amt)
      uniforms.uPointer.value.copy(cur)
      renderer.render(scene, camera)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect()
      else (window as Window).removeEventListener('resize', handleResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (renderer.domElement && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  useEffect(() => {
    const uniforms = uniformsRef.current
    const renderer = rendererRef.current
    if (!uniforms) return

    rotationRef.current = rotation
    autoRotateRef.current = autoRotate
    uniforms.uSpeed.value = speed
    uniforms.uScale.value = scale
    uniforms.uFrequency.value = frequency
    uniforms.uWarpStrength.value = warpStrength
    uniforms.uMouseInfluence.value = mouseInfluence
    uniforms.uParallax.value = parallax
    uniforms.uNoise.value = noise

    const toVec3 = (hex: string) => {
      const h = hex.replace('#', '').trim()
      const full = h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h
      const r = hexPairToByte(full, 0)
      const g = hexPairToByte(full, 2)
      const b = hexPairToByte(full, 4)
      return new THREE.Vector3(r / 255, g / 255, b / 255)
    }

    const arr = (colors || []).filter(Boolean).slice(0, MAX_COLORS).map(toVec3)
    for (let i = 0; i < MAX_COLORS; i++) {
      const vec = uniforms.uColors.value[i]
      if (!vec) continue
      const next = arr[i]
      if (next) vec.copy(next)
      else vec.set(0, 0, 0)
    }
    uniforms.uColorCount.value = arr.length

    uniforms.uTransparent.value = transparent ? 1 : 0
    if (renderer) renderer.setClearColor(0x000000, transparent ? 0 : 1)
  }, [
    rotation,
    autoRotate,
    speed,
    scale,
    frequency,
    warpStrength,
    mouseInfluence,
    parallax,
    noise,
    colors,
    transparent,
  ])

  useEffect(() => {
    const material = materialRef.current
    const container = containerRef.current
    if (!material || !container) return

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1
      const y = -(((e.clientY - rect.top) / (rect.height || 1)) * 2 - 1)
      pointerTargetRef.current.set(x, y)
    }

    container.addEventListener('pointermove', handlePointerMove)
    return () => {
      container.removeEventListener('pointermove', handlePointerMove)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden ${className}`}
      style={style}
    />
  )
}
