import { requireAdminPage } from "@/components/admin-guard";
import AdminShell from "@/components/admin-shell";
import OrderDetail from "./order-detail";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  return (
    <AdminShell>
      <OrderDetail id={id} />
    </AdminShell>
  );
}
