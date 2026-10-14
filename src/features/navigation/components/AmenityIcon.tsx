import {
  CoffeeIcon,
  DoorOpenIcon,
  InfoIcon,
  AccessibilityIcon,
  UtensilsIcon,
  BanknoteIcon,
  ArrowUpDownIcon,
  MapPinIcon,
} from 'lucide-react';
export const AMENITIES = [
  'exit',
  'washroom',
  'elevator',
  'food',
  'coffee',
  'information',
  'atm',
] as const;
export function AmenityIcon({
  category,
  className = 'size-4 shrink-0',
}: {
  category?: string;
  className?: string;
}) {
  const Icon =
    category === 'exit'
      ? DoorOpenIcon
      : category === 'washroom'
        ? AccessibilityIcon
        : category === 'elevator'
          ? ArrowUpDownIcon
          : category === 'food'
            ? UtensilsIcon
            : category === 'coffee'
              ? CoffeeIcon
              : category === 'information'
                ? InfoIcon
                : category === 'atm'
                  ? BanknoteIcon
                  : MapPinIcon;
  return <Icon className={className} aria-hidden="true" />;
}
