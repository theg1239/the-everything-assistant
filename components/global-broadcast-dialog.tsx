"use client"

import { useState, useEffect } from "react";
import { BroadcastDialog } from "@/components/broadcast-dialog";

interface GlobalBroadcastDialogProps {
  latestBroadcast: any;
}

export function GlobalBroadcastDialog({ latestBroadcast }: GlobalBroadcastDialogProps) {
  const [open, setOpen] = useState(!!latestBroadcast);

  useEffect(() => {
    setOpen(!!latestBroadcast);
  }, [latestBroadcast]);

  if (!latestBroadcast) return null;

  return (
    <BroadcastDialog
      isOpen={open}
      onClose={() => setOpen(false)}
      payload={latestBroadcast}
    />
  );
}
