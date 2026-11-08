import { useState, type ReactNode } from "react"
import { Button } from "./ui"

export default function ProgressHistoryPages({ rows }: { rows: ReactNode[] }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / 3))
  const current = Math.min(page, pages)
  return <>
    <div className="spm-history-rows">{rows.slice((current - 1) * 3, current * 3)}</div>
    {rows.length > 3 && <nav className="spm-history-pagination" aria-label="Progress history pagination">
      <Button aria-label="Previous progress history page" disabled={current === 1} onClick={() => setPage(Math.max(1, current - 1))}>Previous</Button>
      <span role="status">Page {current} of {pages}</span>
      <Button aria-label="Next progress history page" disabled={current === pages} onClick={() => setPage(Math.min(pages, current + 1))}>Next</Button>
    </nav>}
  </>
}
