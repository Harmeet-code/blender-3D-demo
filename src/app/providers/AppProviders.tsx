import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from '@/app/providers/QueryProvider.tsx';

/**
 * Composition root for theme, tooltips, query cache, and toast notifications.
 * Keeps `app/main.tsx` focused on mounting the React tree.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider delayDuration={200}>
        <QueryProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </QueryProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
