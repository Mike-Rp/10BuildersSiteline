import DatePicker from "./DatePicker"
import type { ComponentProps } from "react"

type Props = Omit<ComponentProps<typeof DatePicker>, "calendarTitle" | "calendarSubtitle" | "emptyLabel" | "clearable"> & {
  kind?: "start" | "completion"
}

export default function EstimatedCompletionDate({ kind = "completion", ...props }: Props) {
  return <DatePicker {...props} calendarTitle={`Estimated ${kind} date`}
    calendarSubtitle={kind === "start" ? "Choose an estimated start date." : "Choose a date after the estimated start date."}
    emptyLabel={`No ${kind} date selected.`} clearable={false} />
}
