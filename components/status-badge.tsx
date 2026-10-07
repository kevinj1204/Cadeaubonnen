import { STATUS_LABELS, type VoucherStatus } from "@/lib/format";

export default function StatusBadge({ status }: { status: VoucherStatus | string | null }) {
  if (!status) return null;
  return <span className={`badge ${status}`}>{STATUS_LABELS[status as VoucherStatus] ?? status}</span>;
}
