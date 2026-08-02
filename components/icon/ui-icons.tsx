"use client";

import type { IconType } from "react-icons";

import { useBrandIcons } from "@/components/branding/branding-icons-provider";

type IconProps = React.ComponentProps<IconType>;

export function ArrowLeftIcon(props: IconProps): React.JSX.Element {
  const { ArrowLeft } = useBrandIcons();
  return <ArrowLeft {...props} />;
}

export function ArrowRightIcon(props: IconProps): React.JSX.Element {
  const { ArrowRight } = useBrandIcons();
  return <ArrowRight {...props} />;
}

export function ArrowPathIcon(props: IconProps): React.JSX.Element {
  const { ArrowPath } = useBrandIcons();
  return <ArrowPath {...props} />;
}

export function MenuIcon(props: IconProps): React.JSX.Element {
  const { Menu } = useBrandIcons();
  return <Menu {...props} />;
}

export function CheckIcon(props: IconProps): React.JSX.Element {
  const { Check } = useBrandIcons();
  return <Check {...props} />;
}

export function CheckCircleIcon(props: IconProps): React.JSX.Element {
  const { CheckCircle } = useBrandIcons();
  return <CheckCircle {...props} />;
}

export function ChevronDownIcon(props: IconProps): React.JSX.Element {
  const { ChevronDown } = useBrandIcons();
  return <ChevronDown {...props} />;
}

export function ChevronLeftIcon(props: IconProps): React.JSX.Element {
  const { ChevronLeft } = useBrandIcons();
  return <ChevronLeft {...props} />;
}

export function ChevronRightIcon(props: IconProps): React.JSX.Element {
  const { ChevronRight } = useBrandIcons();
  return <ChevronRight {...props} />;
}

export function ChevronUpIcon(props: IconProps): React.JSX.Element {
  const { ChevronUp } = useBrandIcons();
  return <ChevronUp {...props} />;
}

export function ChevronsUpDownIcon(props: IconProps): React.JSX.Element {
  const { ChevronsUpDown } = useBrandIcons();
  return <ChevronsUpDown {...props} />;
}

export function ClockIcon(props: IconProps): React.JSX.Element {
  const { Clock } = useBrandIcons();
  return <Clock {...props} />;
}

export function HeartIcon(props: IconProps): React.JSX.Element {
  const { Heart } = useBrandIcons();
  return <Heart {...props} />;
}

export function HomeIcon(props: IconProps): React.JSX.Element {
  const { Home } = useBrandIcons();
  return <Home {...props} />;
}

export function SearchIcon(props: IconProps): React.JSX.Element {
  const { Search } = useBrandIcons();
  return <Search {...props} />;
}

export function MinusIcon(props: IconProps): React.JSX.Element {
  const { Minus } = useBrandIcons();
  return <Minus {...props} />;
}

export function PlusIcon(props: IconProps): React.JSX.Element {
  const { Plus } = useBrandIcons();
  return <Plus {...props} />;
}

export function ShoppingBagIcon(props: IconProps): React.JSX.Element {
  const { Cart } = useBrandIcons();
  return <Cart {...props} />;
}

export function UserIcon(props: IconProps): React.JSX.Element {
  const { User } = useBrandIcons();
  return <User {...props} />;
}

export function XCircleIcon(props: IconProps): React.JSX.Element {
  const { XCircle } = useBrandIcons();
  return <XCircle {...props} />;
}

export function XIcon(props: IconProps): React.JSX.Element {
  const { X } = useBrandIcons();
  return <X {...props} />;
}
