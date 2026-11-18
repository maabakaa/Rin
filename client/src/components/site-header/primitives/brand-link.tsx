import { Link } from "wouter";
import type { SiteHeaderConfig } from "../shared";
import { ImageWithFallback } from "../../image-with-fallback";
import { darkInvertImageClass } from "../../../utils/image-dark-invert";

export function BrandLink({
  siteConfig,
  className = "",
  avatarClassName,
  compact = false,
  showAvatar = true,
  showDescription = true,
  titleClassName = "",
  descriptionClassName = "",
}: {
  siteConfig: SiteHeaderConfig;
  className?: string;
  avatarClassName?: string;
  compact?: boolean;
  showAvatar?: boolean;
  showDescription?: boolean;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  return (
    <Link aria-label="home" href="/" className={`${className} group`}>
      {showAvatar && siteConfig.avatar ? (
        <ImageWithFallback
          src={siteConfig.avatar}
          alt={siteConfig.name}
          className={avatarClassName || (compact ? "h-16 w-16 rounded-full border-2" : "h-16 w-16 rounded-2xl border-2") + " transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-2 group-hover:scale-[1.2] group-active:scale-95"}
          imageClassName={darkInvertImageClass(siteConfig.avatar)}
        />
      ) : null}
      <div className={`${showAvatar ? (compact ? "mx-2" : "mx-4") : ""} flex min-w-0 flex-col items-start justify-center`}>
        <p className={`max-w-full truncate ${compact ? "text-sm font-bold t-primary" : "text-xl font-bold dark:text-white"} ${titleClassName}`}>{siteConfig.name}</p>
        {showDescription ? <p className={`max-w-full truncate text-xs text-neutral-500 ${descriptionClassName}`}>{siteConfig.description}</p> : null}
      </div>
    </Link>
  );
}
