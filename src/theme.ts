import type { CSSProperties } from 'react';
import type { ThemeDef } from './engine/types';

export function themeVars(theme: ThemeDef): CSSProperties {
  return {
    '--bg': theme.bg,
    '--bg2': theme.bg2,
    '--panel': theme.panel,
    '--border': theme.border,
    '--text': theme.text,
    '--muted': theme.muted,
    '--accent': theme.accent,
    '--tile': theme.tile,
    '--tile-text': theme.tileText,
    '--danger': theme.danger,
    '--arrow': theme.arrow,
    '--title-font': theme.titleFont,
  } as CSSProperties;
}
