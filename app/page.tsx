import { getSettings, publicSettings } from "@/lib/settings";
import OrderFlow from "./order-flow";

export const dynamic = "force-dynamic";

export default async function Page() {
  const settings = publicSettings(await getSettings());
  return <OrderFlow settings={settings} />;
}
