"use client";

import { useState } from "react";
import GeneratePlanModal from "./GeneratePlanModal";

export default function PlanShell() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2"
      >
        ✨ Generate with Claude
      </button>
      {open && <GeneratePlanModal onClose={() => setOpen(false)} />}
    </>
  );
}
