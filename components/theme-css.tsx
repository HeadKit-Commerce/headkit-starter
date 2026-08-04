/**
 * ThemeCSS — injects CSS custom properties derived from store branding colors.
 *
 * Branding data comes from the commerce subgraph. Once the `branding` field is
 * available on the homepage query or as a dedicated endpoint, pass it here.
 */

export interface BrandingColors {
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

const defaultTheme = {
  primaryColor: "#7f54b3",
  secondaryColor: "#000000",
};

const isColorDark = (hexColor: string): boolean => {
  const color = hexColor.startsWith("#") ? hexColor.slice(1) : hexColor;

  let r: number, g: number, b: number;

  if (color.length === 3) {
    r = parseInt(color[0]! + color[0]!, 16);
    g = parseInt(color[1]! + color[1]!, 16);
    b = parseInt(color[2]! + color[2]!, 16);
  } else if (color.length >= 6) {
    r = parseInt(color.slice(0, 2), 16);
    g = parseInt(color.slice(2, 4), 16);
    b = parseInt(color.slice(4, 6), 16);
  } else {
    return false;
  }

  // YIQ formula for perceived brightness
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 128;
};

interface ThemeCSSProps {
  branding: BrandingColors | null;
}

export function ThemeCSS({ branding }: ThemeCSSProps) {
  const primaryColor = branding?.primaryColor ?? defaultTheme.primaryColor;
  const secondaryColor =
    branding?.secondaryColor ?? defaultTheme.secondaryColor;
  const primaryTextColor = isColorDark(primaryColor) ? "#ffffff" : "#000000";

  // purple-500 tracks primary (see globals.css) so icon/link/swatch hovers
  // and badges pick up tenant branding without per-component class rewrites.
  const cssVariables = `
    :root {
      --color-primary: ${primaryColor};
      --color-secondary: ${secondaryColor};
      --color-primary-text: ${primaryTextColor};
      --color-purple-500: ${primaryColor};
      --color-purple-800: ${primaryColor};
    }
  `;

  return <style dangerouslySetInnerHTML={{ __html: cssVariables }} />;
}
