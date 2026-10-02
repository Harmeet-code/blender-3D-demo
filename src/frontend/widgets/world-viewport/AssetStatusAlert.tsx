import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAssetStatus } from '../../entities/asset/model/asset-status.ts';
import { retryAssetLoads } from '../../entities/asset/ui/AssetInstance.tsx';

/** Floating status for 3D asset loads, with retry when something fails. */
export function AssetStatusAlert() {
  const statuses = useAssetStatus((s) => s.statuses);
  const entries = Object.entries(statuses);

  if (entries.length === 0) {
    return null;
  }
  const hasError = entries.some(([, status]) => status.kind === 'error');

  return (
    <Alert
      variant={hasError ? 'destructive' : 'default'}
      role="status"
      aria-live="polite"
      className="absolute top-16 left-3 max-w-sm bg-popover text-popover-foreground shadow-lg"
    >
      <TriangleAlertIcon />
      <AlertTitle>3D assets</AlertTitle>
      <AlertDescription>
        <ScrollArea className="max-h-24">
          <ul className="flex flex-col gap-1">
            {entries.map(([id, status]) => (
              <li key={id}>{status.message}</li>
            ))}
          </ul>
        </ScrollArea>
      </AlertDescription>
      {hasError && (
        <AlertAction>
          <Button type="button" size="sm" onClick={retryAssetLoads}>
            <RotateCcwIcon data-icon="inline-start" />
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
