import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { scope,audit } from './access';
export const lock=mutation({args:{patientId:v.id('patients')},handler:async(ctx,{patientId})=>{
  const a=await scope(ctx,patientId,'finance',true);
  if(a.presentation)return a.presentation._id;
  const id=await ctx.db.insert('presentationSessions',{patientId,sessionId:a.sessionId,staffId:a.staff._id,createdAt:Date.now()});
  await audit(ctx,a.userId,'presentation_locked','patients',patientId);
  return id;
}});
