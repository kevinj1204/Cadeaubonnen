"use client";

import { useEffect } from "react";

/** Geeft in een iframe (WordPress) de hoogte van de pagina door, zodat het iframe meegroeit. */
export default function EmbedHeight({ type }: { type: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type, height: document.documentElement.scrollHeight }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, [type]);
  return null;
}
