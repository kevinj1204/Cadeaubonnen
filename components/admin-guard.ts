import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/security";

/** Gebruik bovenaan elke backoffice-pagina. */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
}
