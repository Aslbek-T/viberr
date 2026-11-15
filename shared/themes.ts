import type { Room, ThemeId } from './events.ts';

// Display names for each room in each theme. Used by both the narrator (brain) and the World (web).
export const ROOM_NAMES: Record<ThemeId, Record<Room, string>> = {
  office: {
    lobby: 'Lobby', screens: 'Design studio', api: 'Mail room', database: 'Archive',
    login: 'Security desk', tests: 'Quality check', setup: 'Supply closet',
  },
  lab: {
    lobby: 'Lab bench', screens: 'Microscope room', api: 'Sample intake', database: 'Cold storage',
    login: 'Badge-access door', tests: 'Control experiment', setup: 'Reagent shelf',
  },
  kitchen: {
    lobby: 'Prep counter', screens: 'Plating station', api: 'Order window', database: 'Pantry and fridge',
    login: 'Staff-only door', tests: 'Taste test', setup: 'Grocery delivery',
  },
};

// What each room means in software terms (plain words).
export const ROOM_MEANING: Record<Room, string> = {
  lobby: 'planning and thinking',
  screens: 'what the user sees (the frontend)',
  api: 'how programs talk to each other (the API)',
  database: 'where data is stored (the database)',
  login: 'who is allowed in (login and permissions)',
  tests: 'checking the code works (tests)',
  setup: 'tools and settings (setup and dependencies)',
};

export const AGENT_COLORS = {
  'claude-code': { normal: '#D97757', safe: '#E69F00', name: 'Claude' },
  cursor: { normal: '#3B82F6', safe: '#0072B2', name: 'Cursor' },
  codex: { normal: '#10B981', safe: '#009E73', name: 'Codex' },
  replay: { normal: '#A78BFA', safe: '#CC79A7', name: 'Agent' },
} as const;
