import { useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { appearanceLogoURL, useAppearanceStore } from "@/stores/use-appearance-store";
import type { ThemeName } from "@/stores/use-theme-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";

type BrandLogoProps = {
    className?: string;
    fallback: ReactNode;
    alt?: string;
    theme?: ThemeName | "auto";
};

export function BrandLogo({ className, fallback, alt = "", theme = "auto" }: BrandLogoProps) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const currentTheme = useActiveTheme();
    const resolvedTheme = theme === "auto" ? currentTheme : theme;
    const builtInSource = resolvedTheme === "dark" ? "/brand/jingche-dark.png" : "/brand/jingche-light.png";
    const source = appearance.logoConfigured ? appearanceLogoURL(appearance, resolvedTheme) : builtInSource;
    const [failedSources, setFailedSources] = useState<string[]>([]);
    const displaySource = failedSources.includes(source) ? builtInSource : source;
    if (failedSources.includes(displaySource)) return <>{fallback}</>;
    return (
        <img
            src={displaySource}
            alt={alt}
            className={cn("block object-contain", className)}
            draggable={false}
            onError={() => setFailedSources((current) => current.includes(displaySource) ? current : [...current, displaySource])}
        />
    );
}

export function BrandLogoFrame({ className, logoClassName, fallback, alt = "", theme = "auto" }: BrandLogoProps & { logoClassName?: string }) {
    const frameEnabled = useAppearanceStore((state) => state.appearance.logoFrameEnabled);
    const unframedStyle: CSSProperties | undefined = frameEnabled
        ? undefined
        : {
              background: "transparent",
              borderColor: "transparent",
              borderRadius: 0,
              boxShadow: "none",
              color: "inherit",
          };
    return (
        <span className={cn("brand-logo-frame", className)} data-logo-frame-enabled={frameEnabled} style={unframedStyle}>
            <BrandLogo className={logoClassName} fallback={fallback} alt={alt} theme={theme} />
        </span>
    );
}
