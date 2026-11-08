export declare const PROFESSIONS: string[];
export declare const ENGINEER_SPECIALIZATIONS: string[];
export declare const SPECIALIZATION_PROFESSIONS: Record<string,string[]>;
export declare const REQUIREMENT_SPECIALIZATIONS: Record<string,string[]>;
export declare const LICENSE_NUMBER_MAX: number;
export function licenseNumberError(value: unknown): string;
export function isoDateValid(value: unknown): boolean;
export function credentialEligible(c: any,today: string,noticeDays?: number): boolean;
export function qualifyingSpecializations(c: any[],s: string[],today: string,noticeDays?: number,legacySpecializations?: string[]): string[];
