import type { Room, ThemeId } from '../../../shared/events.ts';

export interface ThemeStyle {
  sky: number; wall: number; floor: number; text: string;
  rooms: Record<Room, number>;
  emoji: Record<Room, string>;
}

// Flat-color fallback for every theme. Images in public/assets/<theme>/<room>.png are drawn on top when present.
export const THEME_STYLES: Record<ThemeId, ThemeStyle> = {
  lab: {
    sky: 0xe8f4fb, wall: 0x9fb8c8, floor: 0x6d8796, text: '#0f2a3a',
    rooms: { lobby: 0xdcecf5, screens: 0xc9ece8, api: 0xd6f0d2, database: 0xd4e6fb, login: 0xe4dcf5, tests: 0xf7efc6, setup: 0xf8dfc6 },
    emoji: { lobby: '🧪', screens: '🔬', api: '📥', database: '🧊', login: '🪪', tests: '🧫', setup: '🧴' },
  },
  kitchen: {
    sky: 0xfff4e6, wall: 0xb98d64, floor: 0x7a5636, text: '#3a2212',
    rooms: { lobby: 0xf6e2c8, screens: 0xfbd8cf, api: 0xd6f2e2, database: 0xd5e4f7, login: 0xe6dbf5, tests: 0xfaeab9, setup: 0xf9d9b8 },
    emoji: { lobby: '🔪', screens: '🍽️', api: '🛎️', database: '🥫', login: '🚪', tests: '🥄', setup: '📦' },
  },
  office: {
    sky: 0xeef1f5, wall: 0x8e99a8, floor: 0x5d6673, text: '#1c2430',
    rooms: { lobby: 0xe3e7ee, screens: 0xdbe9f7, api: 0xdff1e4, database: 0xe9e1f3, login: 0xf3e0e0, tests: 0xf6f0d5, setup: 0xf2e4d3 },
    emoji: { lobby: '🛋️', screens: '🎨', api: '📬', database: '🗄️', login: '🛂', tests: '✅', setup: '🧰' },
  },
};
