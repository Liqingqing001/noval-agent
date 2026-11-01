export const IS_DEMO = typeof import.meta.env !== 'undefined' && import.meta.env.VITE_DEMO_MODE === 'true';
export const storageKey = (name: string): string => IS_DEMO ? `${name}-demo-v1` : name;
