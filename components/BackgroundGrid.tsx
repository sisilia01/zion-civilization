'use client'
import { useEffect, useRef } from 'react'

export default function BackgroundGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const c = ctx
    const cv = canvas

    cv.width = window.innerWidth
    cv.height = window.innerHeight

    const HERO_H = window.innerHeight
    let colorTime = 0
    let animId: number
    let frame = 0

    const pts = Array.from({ length: 200 }, () => ({
      x: Math.random() * window.innerWidth,
      y: HERO_H + Math.random() * 4000,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
    }))

    function draw() {
      animId = requestAnimationFrame(draw)
      frame++
      if (frame % 2 !== 0) return
      c.clearRect(0, 0, cv.width, cv.height)
      colorTime += 0.004
      const hue = 185 + Math.sin(colorTime) * 25
      const scrollY = window.scrollY
      const minScreenY = HERO_H - scrollY
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = window.innerWidth
        if (p.x > window.innerWidth) p.x = 0
        if (p.y < HERO_H) p.y = HERO_H + 5
        if (p.y > HERO_H + 5000) p.y = HERO_H + 5
      })
      const screen = pts.map(p => ({ sx: p.x, sy: p.y - scrollY }))
      for (let i = 0; i < screen.length; i++) {
        const a = screen[i]
        if (a.sy < minScreenY || a.sy > cv.height) continue
        for (let j = i + 1; j < screen.length; j++) {
          const b = screen[j]
          if (b.sy < minScreenY || b.sy > cv.height) continue
          const dx = a.sx - b.sx
          const dy = a.sy - b.sy
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 130) {
            c.beginPath()
            c.moveTo(a.sx, a.sy)
            c.lineTo(b.sx, b.sy)
            c.strokeStyle = `hsla(${hue},70%,55%,${(1 - dist / 130) * 0.15})`
            c.lineWidth = 0.5
            c.stroke()
          }
        }
      }
      screen.forEach(p => {
        if (p.sy < minScreenY || p.sy > cv.height) return
        c.beginPath()
        c.arc(p.sx, p.sy, 1.2, 0, Math.PI * 2)
        c.fillStyle = `hsla(${hue},75%,65%,0.35)`
        c.fill()
      })
    }

    draw()
    const onResize = () => {
      cv.width = window.innerWidth
      cv.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
