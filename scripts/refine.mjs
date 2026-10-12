import fs from 'node:fs';
function edit(path, replacements) { let source=fs.readFileSync(path,'utf8'); for(const [from,to] of replacements){if(!source.includes(from))throw new Error(`Missing replacement in ${path}: ${from.slice(0,80)}`);source=source.replace(from,to);} fs.writeFileSync(path,source); }
edit('src/team.tsx',[
  ["import { usePortal } from './store';","import { usePortal } from './store';\nimport { ManualIntake, CareControls } from './operations-ui';\nimport { Library } from './catalog';"],
  ['<PatientTable patients={patients}/></>;','<PatientTable patients={patients}/><ManualIntake/></>;'],
  ['</Form></section>}</div><aside className="patient-aside">','</Form></section>}<CareControls/></div><aside className="patient-aside">'],
  ["{tab==='library'&&<Catalog/>}","{tab==='library'&&<Library/>}"],
]);
edit('src/store.tsx',[
  ["adminCommand:async(kind,args)=>{if(kind==='setting')", "adminCommand:async(kind,args)=>{if(kind==='intake'){setData((d:any)=>({...d,extraPatients:[...(d.extraPatients??[]),{_id:crypto.randomUUID(),name:args.name,email:args.email,stage:'deposit_paid',status:'on_track'}]}));return;}if(kind==='operation'){if(args.operation==='owners')setData((d:any)=>({...d,patient:{...d.patient,...args.payload}}));else if(args.operation==='appointment')setData((d:any)=>({...d,appointments:d.appointments.map((a:any)=>a._id===args.payload.id?{...a,...args.payload}:a)}));else if(args.operation==='superbill')throw new Error('Configure clinic billing details and connect Convex to generate a superbill.');return;}if(kind==='setting')"],
]);
edit('src/sample.ts',[["patients:[data.patient,","patients:[data.patient,...(data.extraPatients??[]),"]]);
