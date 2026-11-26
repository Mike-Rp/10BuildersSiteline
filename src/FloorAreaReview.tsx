export default function FloorAreaReview({ area, floors }: { area: number; floors: number }) {
  if (!Number.isFinite(area) || area <= 0 || !Number.isInteger(floors) || floors < 1) return null
  const average = area / floors
  const unusual = average < 1
  const formatted = average.toLocaleString("en-PH", { maximumSignificantDigits: 4 })
  return <div className={`floor-area-review${unusual ? " needs-review" : ""}`}>
    <p aria-live="polite"><strong>Average floor area: {formatted} m² per floor</strong></p>
    {unusual && <>
      <p role="status">The total floor area appears too small for {floors} {floors === 1 ? "floor" : "floors"}. Please review the total floor area and floor count.</p>
      <small>Averages below 1 m² per floor trigger a data-entry review. This is not a minimum building-area requirement.</small>
      <label className="inquiry-check"><input key={`${area}:${floors}`} type="checkbox" required />
        I have reviewed the floor count and total floor area and confirm these values.
      </label>
    </>}
  </div>
}
