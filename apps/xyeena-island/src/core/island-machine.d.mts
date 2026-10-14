export type IslandMode = 'hidden' | 'compact' | 'expanded' | 'pinned';
export type IslandEvent = 'pointer-enter' | 'pointer-leave' | 'activate' | 'collapse' | 'toggle-pin' | 'hide';
export declare const MODES: readonly IslandMode[];
export declare function transition(state: IslandMode, event: IslandEvent): IslandMode;
export declare function shellDimensions(state: IslandMode): {width:number;height:number};
