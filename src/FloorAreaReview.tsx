import { averageFloorAreaError, inquiryLotAreaError, MAX_INQUIRY_FLOORS, MAX_INQUIRY_AREA } from "../Thesis-Backend/src/domain/inquiry-assessment.js"
import { Icon } from "./ui"

export default function FloorAreaReview({ area, floors, lot, summary = false }: { area: number; floors: number; lot?: number; summary?: boolean }) {
  const error = floors > MAX_INQUIRY_FLOORS ? `Enter no more than ${MAX_INQUIRY_FLOORS} floors. This exceeds the supported application range.`
    : area > MAX_INQUIRY_AREA || (lot !== undefined && lot > MAX_INQUIRY_AREA) ? "The area exceeds the supported input range. Please review your measurements."
    : lot !== undefined ? inquiryLotAreaError(lot) || averageFloorAreaError(lot, area, floors) : ""
  if (error) return <div className="floor-area-review needs-review" role="alert"><strong>{error}</strong></div>
  if (lot !== undefined && (!Number.isFinite(lot) || lot <= 0)) return null
  if (!Number.isFinite(area) || area <= 0 || !Number.isInteger(floors) || floors < 1) return null
  const average = area / floors
  const formatted = average.toLocaleString("en-PH", { maximumSignificantDigits: 4 })
  if (summary) return <div className="floor-area-review inquiry-average-summary">
    <Icon name="calculator" size={18} /><span>Average floor area</span>
    <strong aria-live="polite">{formatted} <small>m² per floor</small></strong>
  </div>
  return <div className="floor-area-review">
    <p aria-live="polite"><strong>Average floor area: {formatted} m² per floor</strong></p>
  </div>
}
