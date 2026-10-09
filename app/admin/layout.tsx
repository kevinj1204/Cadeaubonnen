import type { Metadata } from "next";
import "./admin.css";
import EmbedHeight from "@/components/embed-height";

export const metadata: Metadata = {
  title: "Backoffice — Cadeaubonnen",
  robots: { index: false, follow: false },
  appleWebApp: { title: "Backoffice", statusBarStyle: "black-translucent", capable: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm">
      <EmbedHeight type="tlp-admin:height" />
      {children}
    </div>
  );
}
