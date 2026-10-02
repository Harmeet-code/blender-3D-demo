import { useState } from 'react';
import { CheckIcon, CopyIcon, RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useLayoutStore } from '../../entities/building/model/layout-store.ts';

function serialize(source: unknown) {
  return JSON.stringify(source, null, 2);
}

/** Inspect, edit and apply the raw venue layout JSON. */
export function LayoutJsonPanel() {
  const source = useLayoutStore((s) => s.source);
  const layout = useLayoutStore((s) => s.layout);
  const update = useLayoutStore((s) => s.update);
  const error = useLayoutStore((s) => s.error);
  const [draft, setDraft] = useState(() => serialize(source));
  const [copied, setCopied] = useState(false);

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft) as unknown;
    } catch {
      toast.error('Invalid JSON', { description: 'The draft is not valid JSON.' });
      return;
    }
    const result = update(parsed);
    if (result.isErr()) {
      toast.error('Layout rejected', { description: result.error.message });
      return;
    }
    toast.success('Layout applied', { description: `${layout.rooms.length} rooms now live.` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Layout JSON</CardTitle>
        <CardDescription>Edit the raw layout, then apply it to the live venue.</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge variant="secondary">{layout.floors.length} floors</Badge>
          <Badge variant="secondary">{layout.rooms.length} rooms</Badge>
          <Badge variant="secondary">{layout.portals.length} portals</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Last apply failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="layout-json">Venue layout</FieldLabel>
          <Textarea
            id="layout-json"
            value={draft}
            rows={16}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          <FieldDescription>Must match the building layout schema.</FieldDescription>
        </Field>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft(serialize(source));
            toast.info('Draft reset to the live layout.');
          }}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(draft).then(() => {
              setCopied(true);
              window.setTimeout(() => {
                setCopied(false);
              }, 1500);
            });
          }}
        >
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" onClick={apply} className="ml-auto">
          <CheckIcon data-icon="inline-start" />
          Apply layout
        </Button>
      </CardFooter>
    </Card>
  );
}
