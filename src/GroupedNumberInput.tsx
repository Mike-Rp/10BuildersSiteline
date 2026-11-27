import { useLayoutEffect, useRef, type ComponentProps } from "react"

type Props = Omit<ComponentProps<"input">, "type" | "inputMode" | "value" | "onChange" | "min" | "max"> & {
  value: string
  onValueChange: (value: string) => void
  min?: number
  max?: number
  decimalPlaces?: number
  normalizeLeadingZeros?: boolean
  preserveInvalidInput?: boolean
  validateValue?: (value: string) => string
  inputMode?: "decimal" | "numeric"
}

export default function GroupedNumberInput({ value, onValueChange, min, max, decimalPlaces, normalizeLeadingZeros = false, preserveInvalidInput = false, validateValue, inputMode = "decimal", ...props }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const caret = useRef<number | undefined>(undefined)
  const display = value.replace(/^[0-9]+/, whole => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ","))

  useLayoutEffect(() => {
    const field = input.current
    if (!field) return
    const number = Number(value)
    const fractionLength = value.split(".")[1]?.length ?? 0
    field.setCustomValidity(!value ? "" : validateValue?.(value) || (
      !Number.isFinite(number) ? "Enter a valid number."
      : min !== undefined && number < min ? `Enter a value of at least ${min}.`
      : max !== undefined && number > max ? `Enter a value of ${max.toLocaleString("en-PH")} or less.`
      : decimalPlaces !== undefined && fractionLength > decimalPlaces ? `Enter at most ${decimalPlaces} decimal places.` : ""))
    if (caret.current === undefined) return
    let position = 0
    let remaining = caret.current
    for (; position < display.length && remaining > 0; position++) {
      if (display[position] !== ",") remaining--
    }
    field.setSelectionRange(position, position)
    caret.current = undefined
  }, [value, display, min, max, decimalPlaces, validateValue])

  return <input {...props} ref={input} type="text" inputMode={inputMode} value={display} onKeyDown={event => {
    props.onKeyDown?.(event)
    const field = event.currentTarget
    const start = field.selectionStart
    if (event.defaultPrevented || start === null || start !== field.selectionEnd) return
    if (event.key === "Backspace" && field.value[start - 1] === ",") field.setSelectionRange(start - 1, start - 1)
    if (event.key === "Delete" && field.value[start] === ",") field.setSelectionRange(start + 1, start + 1)
  }} onChange={event => {
    const field = event.currentTarget
    const raw = field.value.replace(/,/g, "")
    if (!preserveInvalidInput && !/^\d*(?:\.\d*)?$/.test(raw)) return
    if (!normalizeLeadingZeros && raw === value) return
    const next = normalizeLeadingZeros ? raw.replace(/^0+(?=\d)/, "") : raw
    const offset = field.value.slice(0, field.selectionStart ?? field.value.length).replace(/,/g, "").length
    caret.current = Math.max(0, offset - (raw.length - next.length))
    if (next === value) {
      // React need not render when stripping zeros leaves the value unchanged.
      field.value = display
      let position = 0, remaining = caret.current
      for (; position < display.length && remaining > 0; position++) if (display[position] !== ",") remaining--
      field.setSelectionRange(position, position)
      caret.current = undefined
      return
    }
    onValueChange(next)
  }} />
}
