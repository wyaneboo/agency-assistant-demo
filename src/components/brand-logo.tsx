import { cn } from "@/lib/utils";

type BrandLogoVariant = "mark" | "lockup" | "full";
type BrandLogoTone = "light" | "dark";

const logoSources: Record<BrandLogoVariant, Record<BrandLogoTone, string>> = {
  mark: {
    light: "/brand/thl-mark-light.png",
    dark: "/brand/thl-mark-dark.png",
  },
  lockup: {
    light: "/brand/thl-lockup-light.png",
    dark: "/brand/thl-lockup-dark.png",
  },
  full: {
    light: "/brand/thl-lockup-light.png",
    dark: "/brand/thl-lockup-dark.png",
  },
};

const defaultSizes: Record<BrandLogoVariant, string> = {
  mark: "h-9 w-9",
  lockup: "h-10 w-auto",
  full: "h-24 w-auto max-w-full",
};

export function BrandLogo({
  variant = "mark",
  tone = "light",
  className,
}: {
  variant?: BrandLogoVariant;
  tone?: BrandLogoTone;
  className?: string;
}) {
  const alt = variant === "mark" ? "THL" : "Teamwork Harmonious Leadership";

  return (
    <img
      src={logoSources[variant][tone]}
      alt={alt}
      className={cn("shrink-0 object-contain", defaultSizes[variant], className)}
      draggable={false}
    />
  );
}
