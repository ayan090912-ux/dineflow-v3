export type CartThemeId = 'amber_street' | 'cyber_neon' | 'sunset_crimson' | 'emerald_fresh' | 'midnight_noir';

export interface CartTheme {
  id: CartThemeId;
  name: string;
  subtitle: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  cardBorder: string;
  textColor: string;
  mutedTextColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  pillActiveBg: string;
  pillActiveText: string;
  buttonGradient: string;
  ringColor: string;
  accentGlow: string;
}

export const CART_THEMES: CartTheme[] = [
  {
    id: 'amber_street',
    name: 'Amber Street',
    subtitle: 'Warm Classic Food Cart',
    tagline: 'Fresh Street Eats & Sizzling Delights',
    primaryColor: '#f59e0b',
    accentColor: '#fbbf24',
    backgroundColor: '#07090e',
    surfaceColor: '#0e121a',
    cardBorder: '#1f2638',
    textColor: '#f8fafc',
    mutedTextColor: '#94a3b8',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeBorder: 'rgba(245, 158, 11, 0.35)',
    badgeText: '#fbbf24',
    pillActiveBg: '#f59e0b',
    pillActiveText: '#0a0a0a',
    buttonGradient: 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950',
    ringColor: 'ring-amber-500',
    accentGlow: 'rgba(245, 158, 11, 0.25)',
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon',
    subtitle: 'Electric Cyan & Night Kart',
    tagline: 'High-Tech Urban Street Kitchen',
    primaryColor: '#06b6d4',
    accentColor: '#22d3ee',
    backgroundColor: '#040913',
    surfaceColor: '#091322',
    cardBorder: '#162844',
    textColor: '#f0fdfa',
    mutedTextColor: '#94a3b8',
    badgeBg: 'rgba(6, 182, 212, 0.15)',
    badgeBorder: 'rgba(6, 182, 212, 0.35)',
    badgeText: '#22d3ee',
    pillActiveBg: '#06b6d4',
    pillActiveText: '#020617',
    buttonGradient: 'bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500 text-slate-950',
    ringColor: 'ring-cyan-400',
    accentGlow: 'rgba(6, 182, 212, 0.25)',
  },
  {
    id: 'sunset_crimson',
    name: 'Sunset Crimson',
    subtitle: 'Fiery Chili & Smoked Grill',
    tagline: 'Spicy Rolls, Sizzling Burgers & Grills',
    primaryColor: '#f43f5e',
    accentColor: '#fb7185',
    backgroundColor: '#0d070a',
    surfaceColor: '#170e13',
    cardBorder: '#331b26',
    textColor: '#fff1f2',
    mutedTextColor: '#fda4af',
    badgeBg: 'rgba(244, 63, 94, 0.15)',
    badgeBorder: 'rgba(244, 63, 94, 0.35)',
    badgeText: '#fb7185',
    pillActiveBg: '#f43f5e',
    pillActiveText: '#ffffff',
    buttonGradient: 'bg-gradient-to-r from-rose-500 via-orange-500 to-rose-500 text-white',
    ringColor: 'ring-rose-500',
    accentGlow: 'rgba(244, 63, 94, 0.25)',
  },
  {
    id: 'emerald_fresh',
    name: 'Emerald Fresh',
    subtitle: 'Mint, Herb & Pure Veg',
    tagline: 'Farm-Fresh Shakes, Chaats & Bites',
    primaryColor: '#10b981',
    accentColor: '#34d399',
    backgroundColor: '#040d09',
    surfaceColor: '#0a1a12',
    cardBorder: '#143324',
    textColor: '#f0fdf4',
    mutedTextColor: '#86efac',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeBorder: 'rgba(16, 185, 129, 0.35)',
    badgeText: '#34d399',
    pillActiveBg: '#10b981',
    pillActiveText: '#022c22',
    buttonGradient: 'bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-500 text-slate-950',
    ringColor: 'ring-emerald-500',
    accentGlow: 'rgba(16, 185, 129, 0.25)',
  },
  {
    id: 'midnight_noir',
    name: 'Midnight Noir',
    subtitle: 'Monochrome Minimal Luxury',
    tagline: 'Curated Street Gastronomy & Brews',
    primaryColor: '#f8fafc',
    accentColor: '#cbd5e1',
    backgroundColor: '#000000',
    surfaceColor: '#111111',
    cardBorder: '#27272a',
    textColor: '#ffffff',
    mutedTextColor: '#a1a1aa',
    badgeBg: 'rgba(255, 255, 255, 0.12)',
    badgeBorder: 'rgba(255, 255, 255, 0.25)',
    badgeText: '#f8fafc',
    pillActiveBg: '#f8fafc',
    pillActiveText: '#09090b',
    buttonGradient: 'bg-gradient-to-r from-slate-100 via-white to-slate-200 text-slate-950',
    ringColor: 'ring-slate-300',
    accentGlow: 'rgba(255, 255, 255, 0.2)',
  },
];

export function resolveCartTheme(themeOrId?: any): CartTheme {
  if (!themeOrId) return CART_THEMES[0];

  if (typeof themeOrId === 'string') {
    const found = CART_THEMES.find((t) => t.id === themeOrId);
    return found || CART_THEMES[0];
  }

  if (typeof themeOrId === 'object') {
    const rawId = themeOrId.id || themeOrId.themeId || themeOrId.theme_id;
    if (rawId) {
      const found = CART_THEMES.find((t) => t.id === rawId);
      if (found) {
        return {
          ...found,
          primaryColor: themeOrId.primaryColor || found.primaryColor,
          accentColor: themeOrId.accentColor || found.accentColor,
        };
      }
    }
    if (themeOrId.primaryColor) {
      const matchingColor = CART_THEMES.find(
        (t) => t.primaryColor.toLowerCase() === themeOrId.primaryColor.toLowerCase()
      );
      if (matchingColor) return matchingColor;
    }
  }

  return CART_THEMES[0];
}
