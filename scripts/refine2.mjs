import fs from 'node:fs';
function edit(path, replacements) { let source=fs.readFileSync(path,'utf8'); for(const [from,to] of replacements){if(!source.includes(from))throw new Error(`Missing replacement in ${path}: ${from.slice(0,80)}`);source=source.replace(from,to);} fs.writeFileSync(path,source); }
edit('convex/schema.ts',[
 ["ghlOpportunityId: optionalString, stripeCustomerId:","ghlOpportunityId: optionalString, ghlDesiredStage: optionalString, stripeCustomerId:"],
 ["status: v.string(), appliedToId:","status: v.string(), refundedCents: v.optional(v.number()), appliedToId:"],
 ["staffOnly: v.boolean() }).index('by_patient', ['patientId'])","staffOnly: v.boolean(), key: v.optional(v.string()) }).index('by_patient', ['patientId']).index('by_key', ['key'])"],
]);
edit('convex/documents.ts',[
 ["await ctx.db.insert('documents',{patientId:a.patientId,kind:a.kind,fileId:a.fileId,name:a.name,at:Date.now(),staffOnly:a.kind==='chart_export'});", "if(await ctx.db.query('documents').withIndex('by_key',q=>q.eq('key',a.key)).unique())return;await ctx.db.insert('documents',{patientId:a.patientId,kind:a.kind,fileId:a.fileId,name:a.name,at:Date.now(),staffOnly:a.kind==='chart_export',key:a.key});"],
 ["clinic.address??'',...lines", "clinic.address??'',`Provider NPI: ${clinic.npi??'Not configured'} | Tax ID: ${clinic.taxId??'Not configured'}`,...lines"],
]);
edit('convex/auth.ts',[["if (patient) {", "if (patient) {\n        await ctx.db.insert('events', { patientId: patient._id, type: 'link_opened', data: {}, at: Date.now() });"]]);
edit('convex/portal.ts',[["return { ...base, ...data, exercises:", "return { ...base, ...data, planTemplates: actor.staff ? await ctx.db.query('planTemplates').collect() : [], exercises:"]]);
edit('src/ui.tsx',[
 ["{plan.status==='sent'&&<>", "{plan.status==='sent'&&!p.viewer.staffId&&<>"],
 ["<Button className=\"outline\" onClick={()=>p.checkout('manage')}>Manage payment method <ArrowUpRight size={17}/></Button>", "{!p.viewer.staffId&&<Button className=\"outline\" onClick={()=>p.checkout('manage')}>Manage payment method <ArrowUpRight size={17}/></Button>}"],
]);
edit('src/team.tsx',[
 ["[['name','Clinic name'],['phone','Phone'],['address','Address'],['wear','What to wear']]", "[['name','Clinic name'],['phone','Phone'],['address','Address'],['wear','What to wear'],['npi','Provider NPI'],['taxId','Tax ID']]"],
 ["address:f.get('address'),wear:f.get('wear')", "address:f.get('address'),wear:f.get('wear'),npi:f.get('npi'),taxId:f.get('taxId')"],
]);
