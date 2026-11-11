export const MAX_ENGINEERS_PER_PHASE:number
export function phaseCoverageQuota(required:string[]):number
export function allocatePhaseCoverage(required:string[],candidates:{id:string;qualifiedTags:string[]}[]):{engineers:{id:string;tags:string[]}[];missing:string[];complete:boolean;covered:number;quota:number;quotaMet:boolean}
