/** Commercial preflight. This decision is evaluated on server-authoritative DB records only. */
export interface CertificateLicense {
  id: string; accountId: string; status: string; deploymentMode: string;
  acquisitionMode: string; balanceRemaining: number; ownershipStatus: string;
  ownershipCompletedAt: Date|null; listAmount: number; discountAmount: number;
  amountPaid: number; licensedMajorVersion: number|null; maxSchools: number|null;
  maxBranches: number|null; maxUsers: number|null; maxStudents: number|null;
  maxTeachers: number|null; deviceLimit: number|null;
  requiresPeriodicValidation: boolean; licenseEdition: string|null;
}
export interface CertificatePayment { accountId:string; status:string; amount:number; provider:string|null; providerReference:string|null; paidAt:Date|null }
export interface CertificateActivation { accountId:string; deviceId:string; status:string; revokedAt:Date|null }
export function assertCertificateEligibility(args:{ license:CertificateLicense; payments:CertificatePayment[]; activation:CertificateActivation|null; installationId:string; accountId:string }): void {
  const {license:l,payments,activation:a,installationId,accountId}=args;
  if(l.accountId!==accountId || !accountId) throw Error('Account mismatch');
  if(l.status!=='active' || l.deploymentMode!=='offline_local') throw Error('Offline local license not active');
  if(!['independent_essentials','independent_multi_device'].includes(l.licenseEdition??'')) throw Error('Incorrect license edition');
  if(l.requiresPeriodicValidation) throw Error('Periodic validation cannot be used for permanent offline activation');
  if(l.acquisitionMode!=='outright' || l.balanceRemaining!==0 || l.ownershipStatus!=='completed' || !l.ownershipCompletedAt) throw Error('Permanent ownership not confirmed');
  if(!a || a.accountId!==accountId || a.deviceId!==installationId || a.status!=='active' || a.revokedAt) throw Error('Device activation not authorized');
  const eligible=payments.filter(p=>p.accountId===accountId && p.status==='paid' && p.paidAt && p.provider==='paystack' && !!p.providerReference);
  const total=eligible.reduce((s,p)=>s+p.amount,0);
  const required=Math.max(0,l.listAmount-l.discountAmount);
  if(required<=0 || total<required || l.amountPaid<required) throw Error('Insufficient verified paid transaction evidence');
  if(!Number.isSafeInteger(l.licensedMajorVersion) || (l.licensedMajorVersion??0)<1) throw Error('No entitled major version');
}
