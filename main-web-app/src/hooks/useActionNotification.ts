"use client";

import * as React from "react";
import { toast } from "sonner";

type ActionNotificationState = {
  ok: boolean;
  message: string;
};

type ActionNotificationOptions = {
  notifyOnError?: boolean;
};

/**
 * Announces a completed Server Action result once. Keep blocking form errors
 * in their form context by opting out of error notifications when needed.
 */
export function useActionNotification(
  state: ActionNotificationState,
  { notifyOnError = true }: ActionNotificationOptions = {},
) {
  const previousStateRef = React.useRef(state);

  React.useEffect(() => {
    if (previousStateRef.current === state) return;
    previousStateRef.current = state;

    if (!state.message) return;

    if (state.ok) {
      toast.success(state.message);
    } else if (notifyOnError) {
      toast.error(state.message);
    }
  }, [notifyOnError, state]);
}
