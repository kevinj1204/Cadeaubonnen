import { requireAdminPage } from "@/components/admin-guard";
import AdminShell from "@/components/admin-shell";
import OrdersList from "./orders-list";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage();
  return (
    <AdminShell>
      <OrdersList />
    </AdminShell>
  );
}
