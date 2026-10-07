import { requireAdminPage } from "@/components/admin-guard";
import AdminShell from "@/components/admin-shell";
import NewVoucher from "./new-voucher";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage();
  return (
    <AdminShell>
      <NewVoucher />
    </AdminShell>
  );
}
