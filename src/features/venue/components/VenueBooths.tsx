import { useEffect, useMemo, useState } from 'react';
import { DownloadIcon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiBaseUrl } from '@/api/base-url.ts';
import type {
  VenueBooth,
  VenueCommand,
  VenueInvoice,
  VenueSession,
  VenueSnapshot,
} from '../model/venue-contracts.ts';
import { venueAuthorizationHeaders } from '../model/venue-client.ts';
import {
  VenueAction,
  VenueEmpty,
  VenueField,
  VenueInput,
  VenuePanel,
  VenueSelect,
  venueDate,
  venueMoney,
} from './VenuePrimitives.tsx';

export type VenueExecute = (command: VenueCommand) => Promise<void>;

function invoiceDownload(invoice: VenueInvoice, snapshot: VenueSnapshot) {
  const booking = snapshot.bookings.find((item) => item.id === invoice.bookingId);
  const content = [
    `INVOICE ${invoice.id}`,
    snapshot.event.name,
    `Date: ${venueDate(invoice.createdAt)}`,
    `Booking: ${invoice.bookingId}`,
    `Booth: ${booking?.boothId ?? '—'}`,
    `Amount: ${venueMoney(invoice.amountCents, invoice.currency)}`,
    `Status: ${invoice.status}`,
    'Payment provider: unconfigured. No online payment has been collected.',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `invoice-${invoice.id}.txt`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BoothSettings({
  booth,
  execute,
  pending,
  organizer,
}: {
  booth: VenueBooth;
  execute: VenueExecute;
  pending: boolean;
  organizer: boolean;
}) {
  const [displayName, setDisplayName] = useState(booth.branding?.displayName ?? booth.label),
    [color, setColor] = useState(booth.branding?.color ?? '#c69563'),
    [logoUrl, setLogoUrl] = useState(booth.branding?.logoUrl ?? ''),
    [price, setPrice] = useState(String(booth.priceCents / 100)),
    [currency, setCurrency] = useState(booth.currency),
    [available, setAvailable] = useState(booth.available),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState('');
  return (
    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <h3 className="font-medium">{booth.label} · branding and availability</h3>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void execute({ type: 'branding', boothId: booth.id, displayName, color, logoUrl });
        }}
      >
        <VenueField label="Exhibitor display name">
          <VenueInput
            required
            maxLength={120}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </VenueField>
        <VenueField label="Accent colour">
          <input
            aria-label="Accent colour"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-9 w-full rounded-md border bg-background"
          />
        </VenueField>
        <VenueField label="Upload logo">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={pending || uploading}
            className="text-xs"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              if (
                !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
                file.size > 10 * 1024 * 1024
              ) {
                setUploadError('Use a PNG, JPEG or WebP image up to 10 MB.');
                return;
              }
              setUploading(true);
              setUploadError('');
              try {
                const response = await fetch(`${apiBaseUrl()}/api/media`, {
                  method: 'POST',
                  headers: { ...venueAuthorizationHeaders(), 'Content-Type': file.type },
                  body: file,
                });
                const result: unknown = await response.json();
                if (
                  !response.ok ||
                  typeof result !== 'object' ||
                  result === null ||
                  !('url' in result) ||
                  typeof result.url !== 'string'
                ) {
                  throw new Error('Logo upload failed.');
                }
                setLogoUrl(result.url);
              } catch (cause) {
                setUploadError(cause instanceof Error ? cause.message : 'Logo upload failed.');
              } finally {
                setUploading(false);
              }
            }}
          />
        </VenueField>
        <div className="flex items-center gap-3">
          {logoUrl && (
            <img
              src={`${apiBaseUrl()}${logoUrl}`}
              alt="Uploaded booth logo"
              className="size-12 rounded border object-contain"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={!logoUrl || pending || uploading}
            onClick={() => setLogoUrl('')}
          >
            Remove logo
          </Button>
        </div>
        {uploadError && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {uploadError}
          </p>
        )}
        <Button className="w-fit" disabled={pending || uploading}>
          <UploadIcon className="size-4" />
          {uploading ? 'Uploading…' : 'Save branding'}
        </Button>
      </form>
      {organizer && (
        <form
          className="grid gap-3 border-t pt-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(price);
            if (Number.isFinite(amount) && amount >= 0) {
              void execute({
                type: 'availability',
                boothId: booth.id,
                priceCents: Math.round(amount * 100),
                currency: currency.toUpperCase(),
                available,
              });
            }
          }}
        >
          <VenueField label="Price">
            <VenueInput
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </VenueField>
          <VenueField label="Currency">
            <VenueInput
              maxLength={3}
              pattern="[A-Za-z]{3}"
              required
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            />
          </VenueField>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={available}
              onChange={(event) => setAvailable(event.target.checked)}
            />
            Available for booking
          </label>
          <Button disabled={pending} className="w-fit">
            Save price and availability
          </Button>
        </form>
      )}
    </div>
  );
}

export function VenueBooths({
  snapshot,
  session,
  execute,
  pending,
}: {
  snapshot: VenueSnapshot;
  session: VenueSession;
  execute: VenueExecute;
  pending: boolean;
}) {
  const [search, setSearch] = useState(''),
    [floor, setFloor] = useState('all'),
    [selected, setSelected] = useState(''),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const organizer = ['admin', 'organizer'].includes(session.user.role);
  const floors = useMemo(
    () => [...new Set(snapshot.booths.map((booth) => booth.floorId))],
    [snapshot.booths],
  );
  const filtered = snapshot.booths.filter(
    (booth) =>
      (floor === 'all' || booth.floorId === floor) &&
      `${booth.label} ${booth.id} ${booth.branding?.displayName ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const chosen = snapshot.booths.find((booth) => booth.id === selected);
  return (
    <div className="grid gap-5">
      <VenuePanel
        title="Booth availability"
        description="Green booths are available. Holds expire on the server; bookings create an unpaid invoice. Claims require organizer approval."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
          <VenueField label="Search booths">
            <VenueInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Booth ID or exhibitor"
            />
          </VenueField>
          <VenueSelect
            label="Floor"
            value={floor}
            onChange={setFloor}
            options={[
              { value: 'all', label: 'All floors' },
              ...floors.map((id) => ({ value: id, label: id })),
            ]}
          />
        </div>
        {!snapshot.booths.length && (
          <VenueEmpty>
            There are no booths in this event yet. Add booth rooms in the venue studio, then publish
            this event.
          </VenueEmpty>
        )}
        {!!snapshot.booths.length && !filtered.length && (
          <VenueEmpty>No booths match your search.</VenueEmpty>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((booth) => {
            const hold = snapshot.holds.find(
              (item) =>
                item.boothId === booth.id &&
                item.status === 'active' &&
                Date.parse(item.expiresAt) > now,
            );
            const booking = snapshot.bookings.find(
              (item) => item.boothId === booth.id && item.status === 'confirmed',
            );
            const status = booth.status
              ? booth.status.charAt(0).toUpperCase() + booth.status.slice(1)
              : booking
                ? 'Booked'
                : hold
                  ? 'Held'
                  : booth.available
                    ? 'Available'
                    : 'Unavailable';
            const owned = booth.ownerId === session.user.id;
            const mine = hold?.userId === session.user.id;
            return (
              <article
                key={booth.id}
                className={`grid content-start gap-3 rounded-xl border p-4 ${status === 'Available' ? 'border-emerald-500/30 bg-emerald-500/5' : status === 'Held' ? 'border-amber-500/30 bg-amber-500/5' : 'bg-muted/30'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{booth.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {booth.floorId} · {booth.id}
                    </p>
                  </div>
                  <span className="rounded-full border bg-background px-2 py-1 text-xs">
                    {status}
                  </span>
                </div>
                <p className="text-lg font-medium">
                  {venueMoney(booth.priceCents, booth.currency)}
                </p>
                {booth.branding && <p className="text-sm">{booth.branding.displayName}</p>}
                {hold && (
                  <p className="text-xs text-muted-foreground">
                    {mine ? 'Your hold' : 'Reserved'} ·{' '}
                    {Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000))} seconds left
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!booth.ownerId && !booth.claimUserIds.includes(session.user.id) && (
                    <VenueAction
                      disabled={pending || session.user.role === 'ops'}
                      onClick={() => void execute({ type: 'claim', boothId: booth.id })}
                    >
                      Request claim
                    </VenueAction>
                  )}
                  {booth.claimUserIds.includes(session.user.id) && (
                    <span className="text-xs text-muted-foreground">Claim awaiting approval</span>
                  )}
                  {status === 'Available' && (
                    <VenueAction
                      disabled={pending || session.user.role === 'ops'}
                      onClick={() => void execute({ type: 'hold', boothId: booth.id, minutes: 10 })}
                    >
                      Hold for 10 min
                    </VenueAction>
                  )}
                  {mine && hold && (
                    <>
                      <VenueAction
                        disabled={pending}
                        onClick={() => void execute({ type: 'book', holdId: hold.id })}
                      >
                        Confirm booking
                      </VenueAction>
                      <VenueAction
                        disabled={pending}
                        onClick={() => void execute({ type: 'release-hold', holdId: hold.id })}
                      >
                        Release hold
                      </VenueAction>
                    </>
                  )}
                  {(owned || organizer) && (
                    <VenueAction
                      disabled={pending}
                      onClick={() => setSelected(selected === booth.id ? '' : booth.id)}
                    >
                      {selected === booth.id ? 'Close settings' : 'Edit booth'}
                    </VenueAction>
                  )}
                </div>
                {organizer &&
                  booth.claimUserIds.map((userId) => (
                    <div
                      key={userId}
                      className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs"
                    >
                      <span>
                        {snapshot.users?.find((user) => user.id === userId)?.name ?? userId}
                      </span>
                      <VenueAction
                        disabled={pending}
                        onClick={() =>
                          void execute({
                            type: 'approve-claim',
                            boothId: booth.id,
                            userId,
                            approved: true,
                          })
                        }
                      >
                        Approve
                      </VenueAction>
                      <VenueAction
                        disabled={pending}
                        onClick={() =>
                          void execute({
                            type: 'approve-claim',
                            boothId: booth.id,
                            userId,
                            approved: false,
                          })
                        }
                      >
                        Decline
                      </VenueAction>
                    </div>
                  ))}
              </article>
            );
          })}
        </div>
      </VenuePanel>
      {chosen && (organizer || chosen.ownerId === session.user.id) && (
        <BoothSettings
          key={`${snapshot.event.id}:${chosen.id}`}
          booth={chosen}
          execute={execute}
          pending={pending}
          organizer={organizer}
        />
      )}
      <VenuePanel
        title="Bookings and invoices"
        description="Bookings reserve inventory. Invoice status stays unpaid until a real payment integration is configured; this app does not collect money."
      >
        {!snapshot.invoices.length ? (
          <VenueEmpty>
            No invoices yet. Hold an available booth and confirm a booking to create one.
          </VenueEmpty>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Invoice / booth</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.invoices.map((invoice) => {
                  const booking = snapshot.bookings.find((item) => item.id === invoice.bookingId);
                  return (
                    <tr key={invoice.id} className="border-t">
                      <td className="p-2">
                        <p>{booking?.boothId}</p>
                        <p className="break-all text-xs text-muted-foreground">{invoice.id}</p>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {venueMoney(invoice.amountCents, invoice.currency)}
                      </td>
                      <td className="p-2">{invoice.status}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <VenueAction onClick={() => invoiceDownload(invoice, snapshot)}>
                            <DownloadIcon className="size-3" />
                            Download
                          </VenueAction>
                          {booking?.status === 'confirmed' &&
                            (organizer || booking.userId === session.user.id) && (
                              <VenueAction
                                destructive
                                disabled={pending}
                                onClick={() =>
                                  void execute({ type: 'cancel-booking', bookingId: booking.id })
                                }
                              >
                                Cancel booking
                              </VenueAction>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Online payment unavailable: no payment provider is configured.
        </p>
      </VenuePanel>
    </div>
  );
}
