import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ReactElement,
  type ButtonHTMLAttributes,
} from "react"

export function Icon({ name, size = 20 }: {
  name: string
  size?: number
}) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.3" />
        <rect x="14" y="3" width="7" height="7" rx="1.3" />
        <rect x="3" y="14" width="7" height="7" rx="1.3" />
        <rect x="14" y="14" width="7" height="7" rx="1.3" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V7h10v14M14 12h6v9M2 21h20M7 10h4M7 14h4M7 18h4M17 15v2" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7" />
        <path d="M8 10h2M14 10h2" />
      </>
    ),
    storefront: (
      <>
        <path d="M4 10v11h16V10M3 10l2-7h14l2 7M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2" />
        <path d="M8 21v-6h8v6" />
      </>
    ),
    "mixed-building": (
      <>
        <path d="M3 21h18M5 21V5h8v16M13 9h6v12M8 8h2M8 12h2M8 16h2M16 12h1M16 16h1" />
        <path d="M7 5V3h4v2" />
      </>
    ),
    folder: (
      <path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5" />
      </>
    ),
    helmet: (
      <>
        <path d="M3 17v-3a9 9 0 0 1 18 0v3M8 5v7M16 5v7M2 17h20v4H2zM10 3h4" />
      </>
    ),
    archive: (
      <>
        <rect x="3" y="3" width="18" height="5" rx="1" />
        <path d="M5 8v13h14V8M9 12h6" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 4 2 3 1 4 3 1 3 2 3-2 3-1 1-4 2-3-2-4-3-1-1-3H9Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    bell: (
      <>
        <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    "eye-off": <><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a21 21 0 0 1-3 3.8M6.2 6.2A22 22 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.6M10 10a3 3 0 0 0 4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </>
    ),
    check: <path d="m5 12 4 4L20 5" />,
    alert: (
      <>
        <path d="m12 3 10 18H2L12 3ZM12 9v5M12 17v.5" />
      </>
    ),
    doc: (
      <>
        <path d="M14 2H5v20h14V7l-5-5ZM14 2v6h5M8 12h8M8 16h6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v13m-5-5 5 5 5-5M3 17v4h18v-4" />
      </>
    ),
    trend: (
      <>
        <path d="m3 17 6-6 4 3 8-10M15 4h6v6" />
      </>
    ),
    close: <path d="m5 5 14 14M5 19 19 5" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6M17 2v6M3 11h18M7 15h2M13 15h2" />
      </>
    ),
    activity: <path d="M2 12h4l3-8 6 16 3-8h4" />,
    shield: (
      <>
        <path d="m12 2 8 4v6c0 6-8 10-8 10S4 18 4 12V6l8-4Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    edit: (
      <>
        <path d="m4 16 12-12 4 4L8 20H4v-4ZM13 7l4 4" />
      </>
    ),
    logout: (
      <>
        <path d="M9 4H3v16h6M9 12h12m-5-5 5 5-5 5" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.doc}
    </svg>
  )
}
export function Button({
  children,
  variant = "",
  icon,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string
  icon?: string
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} size={17} />}
      {children}
    </button>
  )
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode
  tone?: string
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  )
}
export function Empty({
  title = "Nothing here yet",
  children,
}: {
  title?: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      <Icon name="folder" size={30} />
      <h3>{title}</h3>
      <p>{children || "Records will appear here as your team works."}</p>
    </div>
  )
}
export function Field({
  label,
  children,
  hint,
  error,
  wide = false,
}: {
  label: string
  children: ReactNode
  hint?: string
  error?: string
  wide?: boolean
}) {
  const id = useId()
  return (
    <div className={`field ${wide ? "wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : (
        hint && <small>{hint}</small>
      )}
    </div>
  )
}
const modalStack: symbol[] = []
let originalOverflow = ""
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const token = Symbol("dialog")
    if (!modalStack.length) originalOverflow = document.body.style.overflow
    modalStack.push(token)
    const previous = document.activeElement as HTMLElement
    document.body.style.overflow = "hidden"
    ref.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return
      if (e.key === "Escape") {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === "Tab") {
        const els = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
          ) || [],
        )
        const first = els[0]
        const last = els.at(-1)
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener("keydown", handler)
    return () => {
      const index = modalStack.indexOf(token)
      if (index !== -1) modalStack.splice(index, 1)
      if (!modalStack.length) document.body.style.overflow = originalOverflow
      document.removeEventListener("keydown", handler)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <Button
            variant="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            icon="close"
          />
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
