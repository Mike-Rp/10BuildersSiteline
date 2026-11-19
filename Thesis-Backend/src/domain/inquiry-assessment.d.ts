export const technicalOptions: string[];
export const arrangementOptions: string[];
export function intakeSize(floorArea: number, floors: number): string;
export function assessInquiry(
  details: Record<string, string | number>,
  estimate: { size: string | null; end: string | null },
  start: string, end: string, technical: string, arrangement: string,
): {
  size: string; score: number; technical: string; arrangement: string; complexity: string;
  durationDays: number; suggestedEnd: string | null;
};
