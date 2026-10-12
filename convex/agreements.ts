import { forPatient } from './access';
import { paymentSchedule } from '../src/domain';
import { enqueue } from './jobs';

export async function eligibleDeposits(ctx:any,patientId:string,planId?:string){
  return (await forPatient(ctx,'payments',patientId)).filter((p:any)=>p.kind==='deposit'&&['paid','partially_refunded'].includes(p.status)&&(!p.appliedToId||p.appliedToId===planId)).map((p:any)=>({id:p._id,amountCents:Math.max(0,p.amountCents-(p.refundedCents??0))})).filter((p:any)=>p.amountCents>0);
}
export async function quote(ctx:any,plan:any){
  const deposits=await eligibleDeposits(ctx,plan.patientId,plan._id),depositCreditCents=deposits.reduce((n:number,p:any)=>n+p.amountCents,0);
  return {...plan,depositCreditCents,deposits};
}
export async function noOpenCheckout(ctx:any,plan:any){
  const attempts=await ctx.db.query('checkoutAttempts').withIndex('by_target',(q:any)=>q.eq('targetId',plan._id)).collect();
  // Wall-clock expiry is not proof that Stripe did not settle a payment. Reconcile first.
  if(attempts.some((a:any)=>!['expired','cancelled','paid'].includes(a.status??'open')))throw new Error('Cancel or reconcile the pending checkout before changing this offer.');
}
export async function invalidateAgreement(ctx:any,plan:any){
  await noOpenCheckout(ctx,plan);
  if(plan.agreementId)await ctx.db.patch(plan.agreementId,{status:'superseded'});
}
export async function acceptAgreement(ctx:any,plan:any,option:'full'|'installments',userId:string){
  if(option==='installments'&&!plan.installmentsApprovedBy)throw new Error('A closer must approve installments for this proposal.');
  if(!Number.isFinite(plan.startDate))throw new Error('Agree on the care start date first.');
  const q=await quote(ctx,plan),schedule=paymentSchedule(plan.priceCents,q.depositCreditCents,option==='installments',plan.startDate);
  if(option==='installments'&&schedule.charges[1].dueAt<=Date.now())throw new Error('The care start date makes an installment overdue. Agree on an updated schedule first.');
  const old=plan.agreementId?await ctx.db.get(plan.agreementId):null;
  if(old&&old.status==='accepted'&&old.option===option&&old.offerVersion===(plan.offerVersion??1)&&old.depositCreditCents===q.depositCreditCents)return old;
  await invalidateAgreement(ctx,plan);
  const terms=`I accept plan version ${plan.version??1}, offer ${plan.offerVersion??1}, with ${option==='installments'?'three authorized charges':'one payment'}. Deposit credit: ${q.depositCreditCents} cents. Care start: ${new Date(plan.startDate).toISOString()}. Charges: ${schedule.charges.map((c,i)=>`${c.amountCents} cents ${i===0?'at acceptance':new Date(c.dueAt).toISOString()}`).join('; ')}.`;
  const id=await ctx.db.insert('paymentAgreements',{patientId:plan.patientId,planId:plan._id,offerVersion:plan.offerVersion??1,planVersion:plan.version??1,priceCents:plan.priceCents,depositCreditCents:q.depositCreditCents,deposits:q.deposits,option,startDate:plan.startDate,charges:[{...schedule.charges[0],dueAt:Date.now()},...schedule.charges.slice(1)],totalCents:schedule.total,terms,acceptedAt:Date.now(),acceptedBy:userId,...(plan.installmentsApprovedBy?{installmentsApprovedBy:plan.installmentsApprovedBy}:{}),status:'accepted'});
  await ctx.db.patch(plan._id,{agreementId:id,depositCreditCents:q.depositCreditCents,paymentOption:option,installments:option==='installments',terms,termsAcceptedAt:Date.now()});
  return await ctx.db.get(id);
}
export async function snapshotPlan(ctx:any,plan:any,state:string){
  const key=`plan:${plan._id}:v${plan.version??1}:o${plan.offerVersion??1}:${state}`;
  const old=await ctx.db.query('planVersions').withIndex('by_key',(q:any)=>q.eq('key',key)).unique();
  if(!old){
    const agreement=plan.agreementId?await ctx.db.get(plan.agreementId):null;
    const author=plan.signedBy?await ctx.db.get(plan.signedBy):null;
    await ctx.db.insert('planVersions',{patientId:plan.patientId,planId:plan._id,version:plan.version??1,state,snapshot:{...plan,agreement,signerName:author?.name??null},at:Date.now(),key});
  }
  await enqueue(ctx,'document',key,{kind:'plan_pdf',planId:plan._id,snapshotKey:key},plan.patientId);
}
