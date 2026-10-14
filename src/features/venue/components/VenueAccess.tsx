import { useState } from 'react';
import { Building2Icon, LockKeyholeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { venueBootstrap, venueLogin } from '../model/venue-client.ts';
import type { VenueSession } from '../model/venue-contracts.ts';
import { VenueField, VenueInput } from './VenuePrimitives.tsx';

export function VenueAccess({
  bootstrapAllowed,
  configured,
  onSession,
}: {
  bootstrapAllowed: boolean;
  configured: boolean;
  onSession: (session: VenueSession) => void;
}) {
  const [name, setName] = useState(''),
    [password, setPassword] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const setup = !configured && bootstrapAllowed;
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Building2Icon />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {setup ? 'Set up your venue workspace' : 'Sign in to venue management'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {setup
            ? 'Create the first administrator account on this local server. Your password protects management actions.'
            : 'Access your events, exhibitor bookings and venue operations.'}
        </p>
      </div>
      {!configured && !bootstrapAllowed ? (
        <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
          This server has no administrator. Ask the server operator to provision an account; initial
          setup is disabled here.
        </p>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError('');
            try {
              onSession(
                await (setup ? venueBootstrap(name, password) : venueLogin(name, password)),
              );
              setPassword('');
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Sign-in failed.');
            } finally {
              setPending(false);
            }
          }}
        >
          <VenueField label="Username">
            <VenueInput
              autoComplete="username"
              maxLength={120}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </VenueField>
          <VenueField label="Password">
            <VenueInput
              type="password"
              autoComplete={setup ? 'new-password' : 'current-password'}
              minLength={setup ? 12 : undefined}
              maxLength={200}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </VenueField>
          {setup && (
            <p className="text-xs text-muted-foreground">
              Use at least 12 characters. Keep this password safe.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={pending}>
            <LockKeyholeIcon className="size-4" />
            {pending ? 'Connecting…' : setup ? 'Create administrator' : 'Sign in'}
          </Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">
        Session credentials stay in memory. Refreshing this page requires signing in again.
      </p>
    </div>
  );
}
