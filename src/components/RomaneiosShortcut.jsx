// src/components/RomaneiosShortcut.jsx
import React from "react";
import { Link } from "react-router-dom";
import { Truck } from "lucide-react";

export default function RomaneiosShortcut() {
  return (
    <Link
      to="/romaneios"
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted transition"
      title="Romaneios (Logística)"
    >
      <Truck className="h-4 w-4" />
      Romaneios (Logística)
    </Link>
  );
}
