import { SearchXIcon, ShoppingCartIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActiveLayout } from '../../entities/building/model/active-layout.ts';
import { BOOTH_ADD_ONS } from '../../entities/building/model/building-schema.ts';
import { decodeLogo } from '../../entities/asset/model/branding.ts';
import { ADD_ON_VISUALS } from '../../entities/asset/model/add-on-visuals.ts';
import { useAssetStatus } from '../../entities/asset/model/asset-status.ts';
import { retryAssetLoads, hasFailedAssetLoads } from '../../entities/asset/ui/AssetInstance.tsx';
import { signedArea } from '../../shared/lib/geometry/polygon.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import { reserveBooth } from '../../entities/booth/api/booths-client.ts';

type ReservationStatus =
  | { state: 'idle' | 'pending' }
  | { state: 'success'; orderId: string }
  | { state: 'error'; message: string };

export function BoothDrawer() {
  const selectedBoothId = useWorldStore((s) => s.selectedBoothId);
  const cart = useWorldStore((s) => s.cart);
  const toggleAddOn = useWorldStore((s) => s.toggleAddOn);
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const layout = useActiveLayout();
  const logos = useWorldStore((s) => s.logos);
  const setLogo = useWorldStore((s) => s.setLogo);
  const statuses = useAssetStatus((s) => s.statuses);
  const [logoError, setLogoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reservationStatus, setReservationStatus] = useState<ReservationStatus>({ state: 'idle' });
  const reservationPending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setLogoError('');
    setBusy(false);
    if (!reservationPending.current) {
      setReservationStatus({ state: 'idle' });
    }
  }, [selectedBoothId]);

  const selected = selectedBoothId ? (cart[selectedBoothId] ?? []) : [];
  const room = selectedBoothId ? layout.rooms.find((r) => r.id === selectedBoothId) : undefined;

  async function handleReserve() {
    if (!selectedBoothId || reservationPending.current) {
      return;
    }

    reservationPending.current = true;
    setReservationStatus({ state: 'pending' });
    const result = await reserveBooth(import.meta.env['VITE_EVENT_ID'] ?? 'convention-center-01', {
      boothId: selectedBoothId,
      addOns: [...selected],
    });
    reservationPending.current = false;

    if (useWorldStore.getState().selectedBoothId !== selectedBoothId) {
      setReservationStatus({ state: 'idle' });
      return;
    }

    if (result.isErr()) {
      setReservationStatus({ state: 'error', message: result.error.message });
      return;
    }
    setReservationStatus({ state: 'success', orderId: result.value.orderId });
  }

  return (
    <Sheet
      open={!!selectedBoothId}
      onOpenChange={(open) => {
        if (!open) {
          selectBooth(null);
        }
      }}
    >
      <SheetContent side="right" className="flex w-80 flex-col gap-0 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{selectedBoothId ?? 'Booth'}</SheetTitle>
          <SheetDescription>Choose add-ons and preview their placement.</SheetDescription>
        </SheetHeader>
        <Separator />
        <Tabs defaultValue="addons" className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="addons">Add-ons</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="addons" className="min-h-0 flex-1">
            <ScrollArea className="h-full p-4">
              <FieldSet>
                {BOOTH_ADD_ONS.map((addOn) => {
                  const checked = selectedBoothId ? selected.includes(addOn.id) : false;
                  return (
                    <Field key={addOn.id} orientation="horizontal">
                      <Checkbox
                        id={`addon-${addOn.id}`}
                        checked={checked}
                        onCheckedChange={() => {
                          if (selectedBoothId) {
                            toggleAddOn(selectedBoothId, addOn.id);
                          }
                        }}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`addon-${addOn.id}`}>
                          <FieldTitle>{addOn.label}</FieldTitle>
                          <Badge variant="secondary">
                            {ADD_ON_VISUALS[addOn.id]?.kind === 'logistics'
                              ? 'service preview'
                              : ADD_ON_VISUALS[addOn.id]?.kind === 'nonvisual'
                                ? 'service'
                                : ADD_ON_VISUALS[addOn.id]?.kind === 'branding'
                                  ? 'branding'
                                  : 'object'}
                          </Badge>
                        </FieldLabel>
                        <FieldDescription>
                          {ADD_ON_VISUALS[addOn.id]?.kind === 'logistics'
                            ? 'Service preview in a designated area.'
                            : ADD_ON_VISUALS[addOn.id]?.kind === 'nonvisual'
                              ? 'Service selection; no 3D object.'
                              : 'Preview for this booth.'}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldSet>
              {selected.includes('logo-banner') && selectedBoothId && (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="booth-logo">Booth logo</Label>
                  <Input
                    id="booth-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) {
                        return;
                      }
                      const current = ++generation.current;
                      setBusy(true);
                      setLogoError('');
                      void decodeLogo(file).then((result) => {
                        if (current !== generation.current) {
                          return;
                        }
                        setBusy(false);
                        if (result.isErr()) {
                          setLogoError(result.error.message);
                          return;
                        }
                        setLogo(selectedBoothId, result.value);
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    PNG, JPEG or WebP · 2 MiB maximum · 2048 px maximum. Aspect ratio is preserved.
                  </p>
                  <p role="status" className="text-xs">
                    {busy ? 'Reading logo…' : (logos[selectedBoothId]?.name ?? 'Default branding')}
                  </p>
                  {logoError && (
                    <Alert variant="destructive">
                      <AlertDescription>{logoError}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      generation.current++;
                      setBusy(false);
                      setLogoError('');
                      setLogo(selectedBoothId, null);
                    }}
                  >
                    Restore default branding
                  </Button>
                </div>
              )}
              {Object.values(statuses)
                .filter((status) => selectedBoothId && status.message.includes(selectedBoothId))
                .map((status) => (
                  <Alert className="mt-3" key={status.message}>
                    <AlertDescription>{status.message}</AlertDescription>
                  </Alert>
                ))}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="details" className="min-h-0 flex-1">
            <div className="p-4">
              {!room ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchXIcon />
                    </EmptyMedia>
                    <EmptyTitle>Booth not in layout</EmptyTitle>
                    <EmptyDescription>
                      {selectedBoothId} is not part of the active layout.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Booth</TableCell>
                      <TableCell className="text-right font-medium">{room.id}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Floor</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{room.floorId}</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Type</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{room.type}</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Vertices</TableCell>
                      <TableCell className="text-right">{room.polygon.length}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Footprint</TableCell>
                      <TableCell className="text-right">
                        {Math.abs(signedArea(room.polygon)).toFixed(1)} sq units
                      </TableCell>
                    </TableRow>
                    {room.price !== undefined && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">Price</TableCell>
                        <TableCell className="text-right">${room.price.toFixed(0)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <SheetFooter>
          {hasFailedAssetLoads() && (
            <Button variant="outline" onClick={retryAssetLoads}>
              Retry assets
            </Button>
          )}
          <Button
            type="button"
            disabled={
              !selectedBoothId ||
              reservationStatus.state === 'pending' ||
              reservationStatus.state === 'success'
            }
            onClick={() => void handleReserve()}
          >
            <ShoppingCartIcon data-icon="inline-start" />
            {reservationStatus.state === 'pending'
              ? 'Reserving…'
              : reservationStatus.state === 'success'
                ? 'Reserved'
                : `Reserve — ${selected.length} add-on${selected.length === 1 ? '' : 's'}`}
          </Button>
          {reservationStatus.state === 'pending' && (
            <p role="status" className="text-xs text-muted-foreground">
              Creating your pending order…
            </p>
          )}
          {reservationStatus.state === 'success' && (
            <Alert>
              <AlertDescription>
                Reservation successful. Pending order ID: {reservationStatus.orderId}
              </AlertDescription>
            </Alert>
          )}
          {reservationStatus.state === 'error' && (
            <Alert variant="destructive">
              <AlertDescription>{reservationStatus.message}</AlertDescription>
            </Alert>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
