"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { forgetBrowserSessionAction } from "@/features/auth/actions/forget-browser-session.action";
import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon-lg" : "sm"}
      className={cn(className)}
      disabled={isPending}
      aria-label={compact ? (isPending ? "Saindo…" : "Sair") : undefined}
      title={compact ? (isPending ? "Saindo…" : "Sair") : undefined}
      onClick={() =>
        startTransition(async () => {
          await forgetBrowserSessionAction();
          router.replace("/auth/login");
          router.refresh();
        })
      }
    >
      <LogOut />
      {!compact && (isPending ? "Saindo…" : "Sair")}
    </Button>
  );
}
