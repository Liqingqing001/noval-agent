import { useState } from 'react';
import { resolveCharacterPortrait } from '@/lib/characterProfiles';
import '@/styles/character-board.css';

export function CharacterPortrait({ avatar, name, className = '' }: { avatar?: string; name: string; className?: string }) {
  const portrait = resolveCharacterPortrait(avatar, import.meta.env.BASE_URL);
  const [failed, setFailed] = useState<string>();
  const fallback = Array.from(name.trim()).slice(0, 2).join('');
  if (!portrait || failed === portrait.src) return <span className={`character-avatar ${className}`} role="img" aria-label={`${name}人物头像`}>{fallback}</span>;
  const cell = portrait.cell;
  return <span className={`character-avatar ${className}`} role="img" aria-label={`${name}人物头像`} style={cell ? {
    backgroundImage: `url(${JSON.stringify(portrait.src)})`,
    backgroundSize: `${cell.columns * 100}% ${cell.rows * 100}%`,
    backgroundPosition: `${cell.columns === 1 ? 0 : cell.index % cell.columns / (cell.columns - 1) * 100}% ${cell.rows === 1 ? 0 : Math.floor(cell.index / cell.columns) / (cell.rows - 1) * 100}%`,
    backgroundRepeat: 'no-repeat',
  } : undefined}><img src={portrait.src} alt="" draggable={false} onError={() => setFailed(portrait.src)} style={cell ? { width: 0, height: 0, opacity: 0 } : undefined} /></span>;
}
