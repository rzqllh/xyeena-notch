export type IslandMode = 'hidden' | 'dormant' | 'compact' | 'glance' | 'expanded' | 'focused' | 'pinned';
export type IslandEvent = 'pointer-enter' | 'pointer-leave' | 'activate' | 'glance' | 'collapse' | 'toggle-pin' | 'hide';
export declare const MODES: readonly IslandMode[];
export declare function transition(state: IslandMode, event: IslandEvent): IslandMode;
export declare function shellDimensions(state: IslandMode): {width:number;height:number};
