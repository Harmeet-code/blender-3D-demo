import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
  const { theme, setTheme } = useTheme();
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const toggleDollhouse = useWorldStore((s) => s.toggleDollhouse);
  const proof = useWorldStore((s) => s.assetProof);
  const toggleProof = useWorldStore((s) => s.toggleAssetProof);
  const lowQuality = useWorldStore((s) => s.lowQuality);
  const toggleQuality = useWorldStore((s) => s.toggleQuality);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Display options for the 3D venue. Saved for this session.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Dollhouse view</FieldTitle>
              <FieldDescription>Explode floors into a stacked diorama.</FieldDescription>
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
              <FieldDescription>Swap the venue for the asset-proof layout.</FieldDescription>
            </FieldContent>
            <Switch checked={proof} onCheckedChange={toggleProof} aria-label="Asset preview" />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Low quality</FieldTitle>
              <FieldDescription>Reduce shadows and pixel ratio on weak devices.</FieldDescription>
            </FieldContent>
            <Switch checked={lowQuality} onCheckedChange={toggleQuality} aria-label="Low quality" />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Theme</FieldTitle>
              <FieldDescription>Interface brightness around the 3D canvas.</FieldDescription>
            </FieldContent>
            <Select
              value={theme ?? 'dark'}
              onValueChange={(value) => {
                setTheme(value);
              }}
            >
              <SelectTrigger className="w-28" aria-label="Theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Theme</SelectLabel>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
