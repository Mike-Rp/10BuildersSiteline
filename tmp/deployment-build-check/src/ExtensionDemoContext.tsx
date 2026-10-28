import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  applyExtensionCommand,
  EXTENSION_STORAGE_KEY,
  initialExtensionState,
  REQUEST_STATUSES,
  type DemoActor,
  type ExtensionCommand,
  type ExtensionState,
} from "./extension-demo"

type DemoContext = {
  state: ExtensionState
  storageMessage: string
  execute: (actor: DemoActor, command: ExtensionCommand) => void
  reset: () => void
}
const Context = createContext<DemoContext | null>(null)
export const useExtensionDemo = () => useContext(Context)

export default function ExtensionDemoProvider({
  children,
}: {
  children: ReactNode
}) {
  const [storageMessage, setStorageMessage] = useState("")
  const [state, setState] = useState<ExtensionState>(() => {
    try {
      const raw = localStorage.getItem(EXTENSION_STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw) as ExtensionState
        const seed = initialExtensionState()
        if (
          data.version !== 1 ||
          !Array.isArray(data.projects) ||
          data.projects.length !== seed.projects.length ||
          !Array.isArray(data.requests) ||
          !Array.isArray(data.notices) ||
          data.projects.some(
            (p, i) =>
              p.id !== seed.projects[i].id ||
              p.original !== seed.projects[i].original ||
              !Array.isArray(p.deadlines),
          ) ||
          data.requests.some(
            (r) =>
              !REQUEST_STATUSES.includes(r.status) ||
              !Array.isArray(r.evidence) ||
              !Array.isArray(r.history) ||
              !data.projects.some((p) => p.id === r.projectId),
          )
        )
          throw Error("Invalid demo cache")
        return data
      }
    } catch {
      /* A corrupt or unavailable demo cache never affects real workspace state. */
    }
    return initialExtensionState()
  })
  const current = useRef(state)
  current.current = state
  function commit(next: ExtensionState) {
    // Persist before switching accounts or leaving the prototype.
    try {
      localStorage.setItem(EXTENSION_STORAGE_KEY, JSON.stringify(next))
      setStorageMessage("")
    } catch {
      setStorageMessage(
        "Browser storage is unavailable or full. Demo changes are kept for this session only.",
      )
    }
    current.current = next
    setState(next)
  }
  return (
    <Context.Provider
      value={{
        state,
        storageMessage,
        execute: (actor, command) =>
          commit(applyExtensionCommand(current.current, actor, command)),
        reset: () => commit(initialExtensionState()),
      }}
    >
      {children}
    </Context.Provider>
  )
}
