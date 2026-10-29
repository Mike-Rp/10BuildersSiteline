export type LicenseAccessPolicy = {
  mode: 'normal' | 'view_only' | 'disabled'; prepareReplacement: boolean; newAssignmentsBlocked: boolean;
  daysToExpiry: number | null; noticeOn: string | null; disabledOn: string | null; viewingDaysLeft: number | null;
};
export function licensePolicyDay(date?: Date): string;
export function licenseAccessPolicy(expiry?: string | null, today?: string): LicenseAccessPolicy;
export const LICENSE_ACCESS_DISABLED_MESSAGE: string;
export const LICENSE_VIEW_ONLY_MESSAGE: string;
