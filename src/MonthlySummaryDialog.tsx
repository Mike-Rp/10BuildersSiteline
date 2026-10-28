import Reports from "./Reports"
import { Modal } from "./ui"

export default function MonthlySummaryDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="Monthly project report" subtitle="Monthly figures and exports for projects available to your account." wide onClose={onClose}>
    <Reports embedded />
  </Modal>
}
