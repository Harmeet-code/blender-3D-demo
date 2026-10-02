import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

function initials(id: string) {
  return id.slice(0, 2).toUpperCase();
}

/** Overlapping avatar stack for everyone currently in the venue. */
export function PresenceAvatars({ max = 4 }: { max?: number }) {
  const localAvatar = useWorldStore((s) => s.localAvatar);
  const remoteAvatars = useWorldStore((s) => s.remoteAvatars);
  const remotes = Array.from(remoteAvatars.values()).slice(0, Math.max(0, max - 1));
  const overflow = Math.max(0, remoteAvatars.size - remotes.length);

  return (
    <AvatarGroup>
      <Avatar title={`You (${localAvatar.floorId})`}>
        <AvatarFallback>YO</AvatarFallback>
      </Avatar>
      {remotes.map((avatar) => (
        <Avatar key={avatar.id} title={`${avatar.id} (${avatar.floorId})`}>
          <AvatarFallback>{initials(avatar.id)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && <AvatarGroupCount>+{overflow}</AvatarGroupCount>}
    </AvatarGroup>
  );
}
