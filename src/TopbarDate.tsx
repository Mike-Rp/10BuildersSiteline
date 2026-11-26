import { useEffect, useState } from "react"
import { Icon } from "./ui"
import "./topbar-date.css"

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  weekday: "long",
  month: "short",
  day: "numeric",
  year: "numeric",
})

function currentManilaDate() {
  return formatter.format(new Date())
}

export default function TopbarDate() {
  const [date, setDate] = useState(currentManilaDate)

  useEffect(() => {
    const refresh = () => setDate(currentManilaDate())
    const interval = window.setInterval(refresh, 15_000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])

  return <span className="topbar-date"><Icon name="calendar" size={18} />{date}</span>
}
