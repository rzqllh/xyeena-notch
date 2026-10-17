export type PhosphorIconName =
  | 'folder'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'chevron'
  | 'collapse'
  | 'pin'
  | 'sliders'
  | 'refresh'
  | 'music'
  | 'volume'
  | 'mute'
  | 'search'
  | 'logo'
  | 'shield'
  | 'bell'
  | 'activity'
  | 'clock'
  | 'alert'
  | 'copy'
  | 'headset'
  | 'send'
  | 'check';

export interface IconOptions {
  label?: string;
  title?: string;
  className?: string;
}

export declare const PHOSPHOR_VIEWBOX: string;
export declare const PHOSPHOR_ICONS: Readonly<Record<PhosphorIconName | string, string>>;
export declare function hasIcon(name: string): boolean;
export declare function listIcons(): string[];
export declare function renderIcon(name: PhosphorIconName | string, size?: number, options?: IconOptions): string;
export declare const icon: typeof renderIcon;
