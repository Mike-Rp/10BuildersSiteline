export type LicenseAccessPolicy = {
  mode: 'normal' | 'view_only'; prepareReplacement: boolean; newAssignmentsBlocked: boolean;
  daysToExpiry: number | null; noticeOn: string | null; restrictedOn: string | null;
};
export function licensePolicyDay(date?: Date): string;
export function licenseAccessPolicy(expiry?: string | null, today?: string): LicenseAccessPolicy;
export const LICENSE_VIEW_ONLY_MESSAGE: string;
