import { requireAdminPage } from "@/components/admin-guard";
import AdminShell from "@/components/admin-shell";
import SettingsEditor from "./settings-editor";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage();
  return (
    <AdminShell>
      <SettingsEditor />
    </AdminShell>
  );
}
