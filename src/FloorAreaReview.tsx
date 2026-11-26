import { averageFloorAreaError, MAX_INQUIRY_FLOORS, MAX_INQUIRY_AREA, MIN_AVERAGE_FLOOR_AREA } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

export default function FloorAreaReview({ area, floors, lot }: { area: number; floors: number; lot?: number }) {
  const error = floors > MAX_INQUIRY_FLOORS ? `Enter no more than ${MAX_INQUIRY_FLOORS} floors. This exceeds the supported application range.`
    : area > MAX_INQUIRY_AREA || (lot !== undefined && lot > MAX_INQUIRY_AREA) ? "The area exceeds the supported input range. Please review your measurements."
    : lot !== undefined && averageFloorAreaError(lot, area, floors) ? averageFloorAreaError(lot, area, floors)
    : lot !== undefined && lot > 0 && lot < MIN_AVERAGE_FLOOR_AREA ? `Enter a lot area of at least ${MIN_AVERAGE_FLOOR_AREA} m².`
    : Number.isFinite(area) && area > 0 && Number.isInteger(floors) && floors > 0 && area < floors * MIN_AVERAGE_FLOOR_AREA
      ? `Total floor area must be at least ${(floors * MIN_AVERAGE_FLOOR_AREA).toLocaleString("en-PH")} m² for ${floors} ${floors === 1 ? "floor" : "floors"} (minimum average ${MIN_AVERAGE_FLOOR_AREA} m² per floor). Increase the total area or correct the floor count.`
    : ""
  if (error) return <div className="floor-area-review needs-review" role="alert"><strong>{error}</strong></div>
  if (lot !== undefined && (!Number.isFinite(lot) || lot <= 0)) return null
  if (!Number.isFinite(area) || area <= 0 || !Number.isInteger(floors) || floors < 1) return null
  const average = area / floors
  const formatted = average.toLocaleString("en-PH", { maximumSignificantDigits: 4 })
  return <div className="floor-area-review">
    <p aria-live="polite"><strong>Average floor area: {formatted} m² per floor</strong></p>
  </div>
}
