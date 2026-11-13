import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type AppPayment } from "@prisma/client";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { LicenseCryptoService } from "./license-crypto.service";
import type { AuthUser } from "../common/auth-user";

/** Customer checkout. Never trusts client-supplied price, account, or entitlement. */
@Injectable()
export class IndependentCheckoutService {
  private readonly logger = new Logger(IndependentCheckoutService.name);
  constructor(private readonly prisma:PrismaService,private readonly crypt:LicenseCryptoService,private readonly entitlements:EntitlementsService){}
  private paystackKey(){
    const live=(process.env.PAYSTACK_MODE || (process.env.NODE_ENV==="production"?"live":"test"))==="live";
    const key=live?(process.env.PAYSTACK_LIVE_SECRET_KEY||process.env.PAYSTACK_SECRET_KEY):(process.env.PAYSTACK_TEST_SECRET_KEY||process.env.PAYSTACK_SECRET_KEY);
    if(!key || !key.startsWith(live?"sk_live_":"sk_test_"))throw new ServiceUnavailableException("Paystack is not configured for this environment.");
    return key;
  }
  private escrowKey(){
    const value=process.env.ELEEVEON_LICENSE_ESCROW_KEY || "";
    if(!/^[a-f0-9]{64}$/i.test(value))throw new ServiceUnavailableException("32-byte license escrow encryption key is not configured.");
    return Buffer.from(value,"hex");
  }
  private encrypt(value:string){
    const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",this.escrowKey(),iv);
    const ciphertext=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }
  private decrypt(value:unknown){
    if(typeof value!=="string")return null;
    const a=value.split(".");if(a.length!==3)return null;
    const dec=createDecipheriv("aes-256-gcm",this.escrowKey(),Buffer.from(a[0],"base64url"));
    dec.setAuthTag(Buffer.from(a[1],"base64url"));
    return Buffer.concat([dec.update(Buffer.from(a[2],"base64url")),dec.final()]).toString("utf8");
  }
  private async owner(actor:AuthUser){
    if(!actor?.id || !actor?.accountId)throw new ForbiddenException("Sign in as the account owner.");
    const user=await this.prisma.appUser.findFirst({where:{id:actor.id,accountId:actor.accountId,active:true},include:{account:true,memberships:{where:{active:true}}}});
    if(!user || user.account.status!=="active" || !( ["owner","super_admin"].includes(user.role) || user.memberships.some(m=>["owner","super_admin"].includes(m.role))))throw new ForbiddenException("Only an active account owner may purchase an independent licence.");
    return user;
  }
  private async planForSale(planId:string){
    const plan=await this.prisma.subscriptionPlan.findUnique({where:{id:planId}});
    if(!plan || !plan.active || plan.licenseModel!=="perpetual" || !["independent_essentials","independent_multi_device"].includes(plan.deploymentMode))throw new BadRequestException("Not a purchasable independent package.");
    const metadata=plan.metadata as Record<string,unknown>|null;
    if(metadata?.publicVisible===false || ["private","hidden","internal"].includes(String(metadata?.visibility||"")))throw new ForbiddenException("This package is not publicly available.");
    const modes=Array.isArray(plan.availableAcquisitionModes)?plan.availableAcquisitionModes:[];
    if(modes.length && !modes.includes("outright") && !modes.includes("self_service"))throw new ForbiddenException("Outright purchase is not available for this package.");
    if(plan.currency!=="GHS" || !Number.isSafeInteger(plan.priceOneTime) || (plan.priceOneTime??0)<=0)throw new BadRequestException("Package one-time price is not configured.");
    return plan;
  }
  /** Validate deployment prerequisites before creating any payment record. */
  private checkoutConfiguration() {
    const key = this.paystackKey();
    this.escrowKey();
    if (!process.env.ELEEVEON_OFFLINE_CERTIFICATE_PRIVATE_KEY_PEM || !process.env.ELEEVEON_OFFLINE_CERTIFICATE_KEY_ID) {
      throw new ServiceUnavailableException("Certificate signing is not configured on the backend. Contact Eleeveon support before checkout.");
    }
    const callback = (process.env.ELEEVEON_PUBLIC_FRONTEND_URL || "").replace(/\/$/, "");
    if (!/^https:\/\/[^/]+$/.test(callback)) {
      throw new ServiceUnavailableException("The secure public frontend callback URL is not configured.");
    }
    return { key, callback };
  }

  async start(actor:AuthUser,planId:string,payerEmail:string){
    const user=await this.owner(actor);
    const plan=await this.planForSale(planId);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail||""))throw new BadRequestException("Valid payer email required.");

    // Fail closed BEFORE creating any payment. Never strand a payment because a
    // known missing deployment secret or callback URL was discovered too late.
    const { key, callback } = this.checkoutConfiguration();

    let payment: AppPayment;
    try {
      payment = await this.prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`independent-purchase:${user.accountId}`}))`;
        const pending=await tx.appPayment.findFirst({where:{accountId:user.accountId,provider:"paystack",method:"independent_purchase",status:{in:["pending","requires_customer_action","paid"]}},orderBy:{createdAt:"desc"}});
        if(pending && !pending.perpetualLicenseId)throw new ConflictException(`An earlier purchase needs recovery. Payment ID: ${pending.id}`);
        if(await tx.perpetualLicense.count({where:{accountId:user.accountId,status:{in:["active","pending"]}}}))throw new ConflictException("This account already has a perpetual licence. Contact support for an upgrade.");
        return tx.appPayment.create({data:{accountId:user.accountId,amount:plan.priceOneTime!,currency:"GHS",method:"independent_purchase",provider:"paystack",status:"pending",payerEmail:payerEmail.trim().toLowerCase(),metadata:{planId:plan.id,planCode:plan.code,edition:plan.deploymentMode,unit:"GHS",purchaseType:"outright"}}});
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Unable to create independent purchase for account ${user.accountId}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("The purchase could not be prepared by the billing database. Check Render backend logs and try again later.");
    }

    // Do not assume a network exception means Paystack did not initialize.
    // Preserve the pending record for recovery, rather than allowing a second charge.
    let response: Response;
    try {
      response=await fetch("https://api.paystack.co/transaction/initialize",{
        method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
        body:JSON.stringify({email:payment.payerEmail,amount:payment.amount*100,currency:"GHS",reference:payment.id,callback_url:`${callback}/independent/start?paymentId=${encodeURIComponent(payment.id)}`,metadata:{accountId:user.accountId,planId:plan.id,paymentId:payment.id,purchaseType:"independent_outright"}}),
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      this.logger.error(`Paystack initialization transport failed for payment ${payment.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException(`The payment provider did not respond. Purchase reference: ${payment.id}. Use Recover Purchase before attempting again.`);
    }

    let result: any;
    try { result=await response.json(); }
    catch {
      this.logger.error(`Invalid Paystack initialization response for payment ${payment.id}; HTTP ${response.status}`);
      throw new ServiceUnavailableException(`The payment provider returned an unreadable response. Reference: ${payment.id}. Recover this purchase before retrying.`);
    }
    const checkoutUrl=String(result?.data?.authorization_url||"");
    const checkoutValid=(()=>{try {const url=new URL(checkoutUrl);return url.protocol==="https:" && url.hostname==="checkout.paystack.com";}catch{return false;}})();
    if(!response.ok || result?.status!==true || result?.data?.reference!==payment.id || !checkoutValid){
      this.logger.error(`Paystack rejected or mismatched checkout initialization for payment ${payment.id}: HTTP ${response.status}, provider status ${String(result?.status)}, provider code ${String(result?.code||"unknown")}`);
      throw new ServiceUnavailableException(`Paystack did not confirm checkout initialization. Reference: ${payment.id}. Recover this purchase before retrying.`);
    }
    try {
      await this.prisma.appPayment.update({where:{id:payment.id},data:{status:"requires_customer_action",providerReference:payment.id,authorizationUrl:checkoutUrl,accessCode:result.data.access_code}});
    } catch (error) {
      this.logger.error(`Paystack initialized payment ${payment.id}, but database update failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException(`Paystack checkout was initialized but could not be saved. Reference: ${payment.id}. Recover this purchase; do not initiate another payment.`);
    }
    return {paymentId:payment.id,amount:payment.amount,currency:payment.currency,authorizationUrl:checkoutUrl};
  }
  async latest(actor:AuthUser){
    const user=await this.owner(actor);
    const payment=await this.prisma.appPayment.findFirst({where:{accountId:user.accountId,method:"independent_purchase",provider:"paystack"},orderBy:{createdAt:"desc"},select:{id:true,status:true}});
    return payment?this.status(actor,payment.id):null;
  }
  async status(actor:AuthUser,id:string){
    const user=await this.owner(actor);
    const payment=await this.prisma.appPayment.findFirst({where:{id,accountId:user.accountId,method:"independent_purchase"}});
    if(!payment)throw new NotFoundException("Purchase not found.");
    return {paymentId:payment.id,status:payment.status,amount:payment.amount,currency:payment.currency,authorizationUrl:payment.status==="requires_customer_action"?payment.authorizationUrl:null,licenseId:payment.perpetualLicenseId,licenseKey:payment.perpetualLicenseId?this.decrypt((payment.metadata as any)?.encryptedLicenseKey):null};
  }
  /** Verify directly with Paystack; never accept a redirect flag or webhook body as evidence. */
  async verify(actor:AuthUser,id:string){
    const user=await this.owner(actor);const key=this.paystackKey();this.escrowKey();
    const payment=await this.prisma.appPayment.findFirst({where:{id,accountId:user.accountId,method:"independent_purchase",provider:"paystack"}});
    if(!payment)throw new NotFoundException("Purchase not found.");
    if(payment.perpetualLicenseId)return this.status(actor,id);
    const response=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.id)}`,{headers:{Authorization:`Bearer ${key}`}});
    const verified:any=await response.json();const value=verified?.data;
    if(!response.ok || verified?.status!==true)throw new ServiceUnavailableException("Could not verify directly with Paystack. Please recover this purchase later.");
    if(value?.status!=="success")return {paymentId:id,status:String(value?.status||"pending"),verified:false};
    const metadata=value?.metadata||{};
    if(value.reference!==payment.id || value.currency!=="GHS" || value.amount!==payment.amount*100 || metadata.accountId!==payment.accountId || metadata.paymentId!==payment.id || metadata.planId!==(payment.metadata as any)?.planId || metadata.purchaseType!=="independent_outright")throw new ConflictException("Paystack transaction does not match this purchase. Contact Eleeveon support.");
    const plan=await this.planForSale(String(metadata.planId));
    // A plan price change after checkout must not alter the previously agreed purchase amount.
    const paidAt=value.paid_at?new Date(value.paid_at):new Date();
    const rawLicenseKey=this.crypt.generateLicenseKey();const encryptedLicenseKey=this.encrypt(rawLicenseKey);
    let licenseId:string|undefined;
    const outcome=await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`independent-purchase:${payment.accountId}`}))`;
      const current=await tx.appPayment.findUnique({where:{id:payment.id}});
      if(!current || current.accountId!==user.accountId)throw new ForbiddenException("Purchase account mismatch.");
      if(current.perpetualLicenseId)return {licenseId:current.perpetualLicenseId,created:false};
      const existing=await tx.perpetualLicense.count({where:{accountId:user.accountId,status:{in:["active","pending"]}}});
      if(existing)throw new ConflictException("Account already has a perpetual licence. Keep the paid purchase reference and contact support for reconciliation.");
      const version=String(process.env.ELEEVEON_DESKTOP_VERSION||"1.0.0");
      const major=plan.licensedMajorVersion??Number(version.split(".")[0]);
      if(!Number.isSafeInteger(major)||major<1)throw new ServiceUnavailableException("Desktop major version is not configured.");
      const license=await tx.perpetualLicense.create({data:{accountId:user.accountId,planId:plan.id,licenseKeyHash:this.crypt.hash(rawLicenseKey),licenseKeyPrefix:rawLicenseKey.slice(0,12),status:"active",purchasedVersion:version,entitledVersion:version,licensedMajorVersion:major,maxSchools:plan.maxSchools,maxBranches:plan.maxBranches,maxUsers:plan.maxUsers,maxStudents:plan.maxStudents,maxTeachers:plan.maxTeachers,deviceLimit:plan.deviceLimit,activationLimit:plan.activationLimit,syncPolicy:"platform_only",updatePolicy:plan.updatePolicy,requiresPeriodicValidation:false,validationIntervalDays:null,offlineGraceDays:null,currency:"GHS",listAmount:payment.amount,amountPaid:payment.amount,discountAmount:0,purchasedAt:paidAt,activatedAt:paidAt,acquisitionMode:"outright",agreementAmount:payment.amount,balanceRemaining:0,deploymentMode:"offline_local",licenseEdition:plan.deploymentMode,originalPurchaseAmount:payment.amount,ownershipCompletedAt:paidAt,ownershipStatus:"completed",createdByUserId:actor.id,metadata:{purchasePaymentId:payment.id,source:"verified_paystack_checkout"}}});
      await tx.licenseVersionEntitlement.create({data:{accountId:user.accountId,licenseId:license.id,planId:plan.id,version,majorVersion:major,minimumAppVersion:plan.minimumAppVersion,maximumAppVersion:plan.maximumAppVersion,status:"active",metadata:{source:"verified_paystack_purchase",paymentId:payment.id}}});
      await tx.appPayment.update({where:{id:payment.id},data:{status:"paid",paidAt,perpetualLicenseId:license.id,providerReference:payment.id,metadata:{...(payment.metadata as any),encryptedLicenseKey,verifiedPaystackAmountKobo:value.amount,verifiedPaystackCurrency:value.currency}}});
      return {licenseId:license.id,created:true};
    },{timeout:15000});
    licenseId=outcome.licenseId;
    try{await this.entitlements.rebuild(user.accountId);}catch(e){ /* preserve settled license, allow retry via status */ }
    return {...await this.status(actor,id),licenseId,verified:true};
  }
}
