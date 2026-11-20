export const technicalOptions: string[];
export const arrangementOptions: string[];
export function intakeSize(floorArea: number, floors: number): string;
export function inquirySize(details: Record<string, string | number>): string;
export function assessInquiry(
  details: Record<string, string | number>,
  start: string, end: string, technical: string, arrangement: string,
): {
  size: string; score: number; technical: string; arrangement: string; complexity: string;
  durationDays: number; suggestedEnd: string | null;
  planningDays?: number; durationMultiplier?: number;
};
