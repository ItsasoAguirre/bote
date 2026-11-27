import '@/global.css';

export const Colors = {
  light: {
    text: '#111418',
    textSecondary: '#5F6670',
    background: '#F4F5F8',
    card: '#FFFFFF',
    border: '#E1E4EA',
    primary: '#3B5BDB',
    primarySoft: '#E7ECFD',
    onPrimary: '#FFFFFF',
    positive: '#2B8A3E',
    negative: '#C92A2A',
  },
  dark: {
    text: '#F1F3F5',
    textSecondary: '#A6ADB8',
    background: '#0E0F12',
    card: '#1A1C21',
    border: '#2C2F36',
    primary: '#748FFC',
    primarySoft: '#232A45',
    onPrimary: '#0E0F12',
    positive: '#69DB7C',
    negative: '#FF8787',
  },
} as const;

export type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;


/**
 * Categorical chart colors (fixed order; never cycled). Validated with the dataviz palette
 * checker as a closed ring for the donut, on the card surfaces of both modes. The 6th slot
 * is reserved for "Otras". Light mode needs visible labels (the legend provides them).
 */
export const ChartColors = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c'],
} as const;
