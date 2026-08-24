"use client";

import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
      <Toaster closeButton position="top-center" richColors />
    </ThemeProvider>
  );
}
