export const technicalOptions: string[];
export const arrangementOptions: string[];
export const MIN_INQUIRY_DURATION_DAYS: number;
export const MAX_INQUIRY_FLOORS: number;
export type FloorMeasurements = { mode: "same"; areaPerFloor: number } | { mode: "individual"; areas: number[] };
export function normalizeFloorMeasurements(input: unknown, floorCount: number, lotArea?: number): { measurements: FloorMeasurements; total: number } | null;
export function intakeSize(floorArea: number, floors: number): string;
export function inquirySize(details: Record<string, string | number>): string;
export function inquiryCostEstimate(details: Record<string, string | number>, complexity: string): {
  minimum: number; maximum: number;
} | null;
export function inquiryAssessmentBasis(details: Record<string, string | number>, technical: string, arrangement: string): {
  size: string; typePoints: number; sizePoints: number; floorPoints: number; technicalPoints: number; overlapPoints: number;
  baselineComplexity: string; complexityFactor: number; overlapFactor: number; rate: number;
  medium: [number, number]; extraFloorDays: number;
};
export function earliestInquiryCompletion(start: string, estimate: { suggestedEnd: string | null }): string | null;
export function inquiryAssessmentReady(details: Record<string, string | number>, workflow?: {
  assessment?: unknown; budget?: number; review?: { start: string; end: string; technical?: string; arrangement?: string };
}): boolean;
export function assessInquiry(
  details: Record<string, string | number>,
  start: string, end: string, technical: string, arrangement: string,
): {
  size: string; score: number; technical: string; arrangement: string; complexity: string;
  durationDays: number; suggestedEnd: string | null;
  planningDays?: number; durationMultiplier?: number;
};
