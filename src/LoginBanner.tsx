import { useEffect, useState } from "react"
import { Icon } from "./ui"

const slides = [
  { image: "construction", icon: "building", label: "Project monitoring", title: "Follow progress across every phase", description: "View active sites, approved activity progress, and project timelines." },
  { image: "teams", icon: "users", label: "Team coordination", title: "Keep project responsibilities clear", description: "Review phase assignments, confirmations, and updates with your project team." },
  { image: "documents", icon: "doc", label: "Document management", title: "Keep project records within reach", description: "Access the plans, reports, and documents available to your account." },
]

export default function LoginBanner() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(true)
  const [desktop, setDesktop] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const wide = window.matchMedia("(min-width: 761px)")
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => {
      setDesktop(wide.matches)
      setReducedMotion(reduced.matches)
      setVisible(!document.hidden)
    }
    sync()
    wide.addEventListener("change", sync)
    reduced.addEventListener("change", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      wide.removeEventListener("change", sync)
      reduced.removeEventListener("change", sync)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  useEffect(() => {
    if (!desktop || reducedMotion || !visible || paused || hovered || focused) return
    const timer = window.setInterval(() => setActive(index => (index + 1) % slides.length), 6000)
    return () => window.clearInterval(timer)
  }, [active, desktop, reducedMotion, visible, paused, hovered, focused])

  const slide = slides[active]
  return (
    <aside
      className="login-info login-banner"
      aria-label="Explore SITELINE"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      {slides.map((item, index) => (
        <picture key={item.image} className={`login-photo login-banner-image${index === active ? " is-active" : ""}`} aria-hidden="true">
          <source media="(max-width: 760px)" srcSet="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
          <img
            src={`/images/login-${item.image}-1120.webp`}
            srcSet={`/images/login-${item.image}-720.webp 720w, /images/login-${item.image}-1120.webp 1120w`}
            sizes="(max-width: 1200px) 50vw, 640px"
            width="1120" height="1400" alt="" decoding="async"
          />
        </picture>
      ))}
      <div className="login-photo-label"><Icon name={slide.icon} size={18} /> {slide.label}</div>
      <div className="login-photo-caption">
        <p className="login-banner-brand">SITELINE · 10 Builders</p>
        <div role="group" aria-roledescription="slide" aria-label={`${active + 1} of ${slides.length}`} aria-live="off">
          <h2>{slide.title}</h2>
          <p className="login-banner-description">{slide.description}</p>
        </div>
        <div className="login-banner-controls">
          <div className="login-banner-selectors" role="group" aria-label="Choose a banner">
            {slides.map((item, index) => (
              <button key={item.image} type="button" className="login-banner-dot" aria-label={`Show slide ${index + 1}: ${item.label}`} aria-current={index === active ? "true" : undefined} onClick={() => setActive(index)}>
                <span />
              </button>
            ))}
          </div>
          <span className="login-banner-count" aria-hidden="true">{active + 1} / {slides.length}</span>
          <button type="button" className="login-banner-pause" aria-label={reducedMotion ? "Automatic rotation disabled for reduced motion" : paused ? "Resume banner rotation" : "Pause banner rotation"} disabled={reducedMotion} onClick={() => setPaused(value => !value)}>
            {reducedMotion ? "Paused" : paused ? "Play" : "Pause"}
          </button>
        </div>
      </div>
    </aside>
  )
}
