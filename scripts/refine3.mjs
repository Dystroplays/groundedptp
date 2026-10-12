import fs from 'node:fs';
function edit(path,replacements){let s=fs.readFileSync(path,'utf8');for(const[from,to]of replacements){if(!s.includes(from))throw new Error(`Missing ${path}: ${from.slice(0,60)}`);s=s.replace(from,to);}fs.writeFileSync(path,s);}
edit('src/ui.tsx',[
 ["p.status==='paid'&&p.kind!=='membership').reduce((n:number,p:any)=>n+p.amountCents,0)","['paid','partially_refunded'].includes(p.status)&&p.kind!=='membership').reduce((n:number,p:any)=>n+p.amountCents-(p.refundedCents??0),0)"],
 ["import { DAY, dateLabel, localDate, money, paymentSchedule }", "import { DAY, dateLabel, localDate, money, paymentSchedule, weeklyAdherence }"],
 ["<section className=\"section\"><h2>Milestones that matter</h2>","<section className=\"section\"><h2>Your consistency, week by week</h2><div className=\"adherence-chart\">{weeklyAdherence(d.sessionAssignments,d.sessionLogs).map(w=><div key={w.start}><span>{w.assigned?`${w.done}/${w.assigned}`:'—'}</span><div className=\"adherence-track\"><div style={{height:`${w.assigned?w.done/w.assigned*100:0}%`}}/></div><small>{dateLabel(Date.parse(`${w.start}T12:00:00Z`))}</small></div>)}</div><p className=\"muted small\">Completed sessions / assigned sessions. Program changes keep their original assignments.</p></section><section className=\"section\"><h2>Milestones that matter</h2>"],
]);
edit('src/team.tsx',[
 ["await p.command('saveNote',{kind,subjective:","await p.command('saveNote',{kind,...(f.get('appointmentId')?{appointmentId:String(f.get('appointmentId'))}:{}),subjective:"],
 ['<h2>New note</h2><Field label="Note type">','<h2>New note</h2><Field label="Visit"><select name="appointmentId"><option value="">General chart entry</option>{p.data.appointments.map((a:any)=><option key={a._id} value={a._id}>{a.kind} · {dateLabel(a.startsAt,true)}</option>)}</select></Field><Field label="Note type">'],
]);
edit('src/sample.ts',[
 ["import { DAY, localDate }", "import { DAY, localDate, centralTimestamp }"],
 ["startsAt:now+2*DAY", "startsAt:centralTimestamp(localDate(now+2*DAY),9)"],
]);
