import { useId, type ComponentPropsWithoutRef } from "react"
import { PH_MOBILE_PREFIX } from "../Thesis-Backend/src/domain/mobile-number.js"
import "./mobile-number-input.css"

type Props = Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
}

export default function MobileNumberInput({ value, onValueChange, "aria-describedby": describedBy, ...props }: Props) {
  const hint = useId()
  const digits = value.match(/^(?:\+639|09)([0-9]{0,9})$/)?.[1] ?? ""
  const update = (suffix: string) => onValueChange(suffix ? PH_MOBILE_PREFIX + suffix : "")
  return <span className="mobile-number-input">
    <span className="mobile-number-prefix" aria-hidden="true">+63 9</span>
    <span id={hint} className="sr-only">Enter the nine digits after +63 9.</span>
    <input {...props} type="tel" inputMode="numeric" autoComplete="off"
      aria-describedby={describedBy ? `${hint} ${describedBy}` : hint}
      pattern="[0-9]{9}" maxLength={9} placeholder="XX XXX XXXX"
      title="Enter the nine digits after +63 9."
      value={digits}
      onChange={event => {
        const next = event.target.value
        if (/^[0-9]{0,9}$/.test(next)) update(next)
      }}
      onPaste={event => {
        event.preventDefault()
        const pasted = event.clipboardData.getData("text")
        const complete = pasted.match(/^(?:\+639|09)([0-9]{9})$/)
        if (complete) { update(complete[1]); return }
        if (!/^[0-9]+$/.test(pasted)) return
        const { selectionStart, selectionEnd } = event.currentTarget
        const next = digits.slice(0, selectionStart ?? digits.length) + pasted + digits.slice(selectionEnd ?? digits.length)
        if (next.length <= 9) update(next)
      }}
    />
  </span>
}
