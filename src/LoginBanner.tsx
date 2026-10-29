import { useEffect, useState } from "react"

const slides = [
  { image: "construction", label: "Project monitoring", description: "View active sites, approved activity progress, and project timelines." },
  { image: "teams", label: "Team coordination", description: "Review phase assignments, confirmations, and updates with your project team." },
  { image: "documents", label: "Document management", description: "Access the plans, reports, and documents available to your account." },
]
const clientSlides = [
  { image: "construction", label: "Your project, in view", description: "Follow overall progress, project milestones, and approved updates." },
  { image: "teams", label: "Stay connected", description: "Keep up with your project team and the latest site updates." },
  { image: "documents", label: "Project documents, together", description: "Find the approved plans, reports, and files shared with you." },
]

export default function LoginBanner({ background = false, client = false }: { background?: boolean; client?: boolean }) {
  const items = client ? clientSlides : slides
  const [active, setActive] = useState(background ? 1 : 0)
  const [visible, setVisible] = useState(true)
  const [desktop, setDesktop] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const wide = window.matchMedia("(min-width: 761px)")
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => {
      setDesktop(background || client || wide.matches)
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
  }, [background, client])

  useEffect(() => {
    if (!desktop || reducedMotion || !visible) return
    const timer = window.setInterval(() => setActive(index => (index + 1) % slides.length), 6000)
    return () => window.clearInterval(timer)
  }, [desktop, reducedMotion, visible])

  const slide = items[active]
  const photos = items.map((item, index) => (
    <picture key={item.image} className={`login-photo login-banner-image${index === active ? " is-active" : ""}`} aria-hidden="true">
      {!background && !client && <source media="(max-width: 760px)" srcSet="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />}
      <img src={`/images/login-${item.image}-1120.webp`}
        srcSet={`/images/login-${item.image}-720.webp 720w, /images/login-${item.image}-1120.webp 1120w`}
        sizes={background ? "100vw" : client ? "(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 640px" : "(max-width: 1200px) 50vw, 640px"}
        width="1120" height="1400" alt="" decoding="async" />
    </picture>
  ))
  if (background) return <div className="admin-login-background" aria-hidden="true">{photos}</div>
  return (
    <aside
      className="login-info login-banner"
      aria-label="Explore SITELINE"
      aria-roledescription="carousel"
    >
      {photos}
      <div className="login-photo-caption">
        <p className="login-banner-brand">{client ? "Building with confidence" : "SITELINE · 10 Builders"}</p>
        <div role="group" aria-roledescription="slide" aria-label={`${active + 1} of ${slides.length}`} aria-live="off">
          <h2>{slide.label}</h2>
          <p className="login-banner-description">{slide.description}</p>
        </div>
        <div className="login-banner-footer">
          <div className="login-banner-indicators" aria-hidden="true">
            {slides.map((item, index) => (
              <span key={item.image} className={`login-banner-indicator${index === active ? " is-active" : ""}`} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
