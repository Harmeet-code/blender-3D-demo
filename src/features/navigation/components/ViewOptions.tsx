import { SlidersHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from '@/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';

/** Display toggles that don't deserve permanent toolbar space. */
export function ViewOptions() {
  const showLabels = useWorldStore((s) => s.showLabels),
    toggleLabels = useWorldStore((s) => s.toggleLabels);
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const toggleDollhouse = useWorldStore((s) => s.toggleDollhouse);
  const proof = useWorldStore((s) => s.assetProof);
  const toggleProof = useWorldStore((s) => s.toggleAssetProof);
  const stress = useWorldStore((s) => s.stressPreview);
  const toggleStress = useWorldStore((s) => s.toggleStressPreview);
  const geometryFallback = useWorldStore((s) => s.geometryFallback);
  const toggleFallback = useWorldStore((s) => s.toggleGeometryFallback);
  const showCeilings = useWorldStore((s) => s.showCeilings);
  const toggleCeilings = useWorldStore((s) => s.toggleCeilings);
  const doorsOpen = useWorldStore((s) => s.previewDoorsOpen);
  const toggleDoors = useWorldStore((s) => s.togglePreviewDoors);
  const diagnostics = useWorldStore((s) => s.diagnosticsEnabled),
    toggleDiagnostics = useWorldStore((s) => s.toggleDiagnostics);
  const activeCount = [dollhouse, proof].filter(Boolean).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="View options">
          <SlidersHorizontalIcon data-icon="inline-start" />
          <span className="hidden sm:inline">View options</span>
          {activeCount > 0 && <span className="text-muted-foreground">{activeCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>View options</PopoverTitle>
          <PopoverDescription>How the venue is rendered.</PopoverDescription>
        </PopoverHeader>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Graphics quality</FieldTitle>
              <FieldDescription>
                High detail and lighting stay enabled while you explore.
              </FieldDescription>
            </FieldContent>
            <span className="text-sm font-medium">High</span>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Booth labels</FieldTitle>
              <FieldDescription>Readable labels near the camera.</FieldDescription>
            </FieldContent>
            <Switch checked={showLabels} onCheckedChange={toggleLabels} aria-label="Booth labels" />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Diagnostics</FieldTitle>
            </FieldContent>
            <Switch
              checked={diagnostics}
              onCheckedChange={toggleDiagnostics}
              aria-label="Diagnostics"
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Elevator doors</FieldTitle>
              <FieldDescription>Preview the open pose.</FieldDescription>
            </FieldContent>
            <Switch checked={doorsOpen} onCheckedChange={toggleDoors} aria-label="Elevator doors" />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Booth ceilings</FieldTitle>
              <FieldDescription>Optional overhead panels.</FieldDescription>
            </FieldContent>
            <Switch
              checked={showCeilings}
              onCheckedChange={toggleCeilings}
              aria-label="Booth ceilings"
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Reference venue</FieldTitle>
              <FieldDescription>Twenty booths on each floor.</FieldDescription>
            </FieldContent>
            <Switch checked={stress} onCheckedChange={toggleStress} aria-label="Reference venue" />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Geometry fallback</FieldTitle>
              <FieldDescription>Use placement outlines.</FieldDescription>
            </FieldContent>
            <Switch
              checked={geometryFallback}
              onCheckedChange={toggleFallback}
              aria-label="Geometry fallback"
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Dollhouse</FieldTitle>
              <FieldDescription>Exploded stacked view.</FieldDescription>
            </FieldContent>
            <Switch
              checked={dollhouse}
              onCheckedChange={toggleDollhouse}
              aria-label="Dollhouse view"
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Asset preview</FieldTitle>
              <FieldDescription>Asset-proof layout.</FieldDescription>
            </FieldContent>
            <Switch checked={proof} onCheckedChange={toggleProof} aria-label="Asset preview" />
          </Field>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
