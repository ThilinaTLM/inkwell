// Composition root for cross-cutting providers.
//
// All app-wide providers (router, query client, tooltip, toaster) live
// here so that `App` itself only owns route definitions and auth status.
// Adding a new provider should not require touching `App` or `main`.

import { ReactNode, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { createQueryClient } from "@/lib/api/query-client";

export function AppProviders({ children }: { children: ReactNode }) {
  // useState ensures we create exactly one QueryClient for the lifetime of
  // the app, including under React.StrictMode's double-invoke in dev.
  const [client] = useState(createQueryClient);

  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <TooltipProvider>
          {children}
          <Toaster position="bottom-right" />
          {import.meta.env.DEV && (
            <ReactQueryDevtools buttonPosition="bottom-left" />
          )}
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
