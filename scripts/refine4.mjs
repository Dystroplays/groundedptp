import fs from 'node:fs';
let s=fs.readFileSync('src/team.tsx','utf8');
s=s.replace("import { Library } from './catalog';","import { Library } from './catalog';\nimport { OperationalSettings } from './settings-ui';\nimport { StaffPlanBuilder } from './plan-builder';");
s=s.replace('{canFinance&&<PlanBuilder/>}','{canFinance&&<StaffPlanBuilder/>}');
const start=s.indexOf('<Form onSubmit={async f=>p.adminCommand(\'setting\',{key:String(f.get(\'key\'))');
const end=s.indexOf('</Form></div>}',start);
if(start<0||end<0)throw new Error('Operational form not found');
s=s.slice(0,start)+'<OperationalSettings/>'+s.slice(end+7);
// Remove superseded, inaccessible components.
const planStart=s.indexOf('function PlanBuilder()');const planEnd=s.indexOf('export function Admin()',planStart);
s=s.slice(0,planStart)+s.slice(planEnd);
const oldCatalog=s.indexOf('const catalogExamples:');const metricsStart=s.indexOf('export function Metrics()',oldCatalog);
s=s.slice(0,oldCatalog)+s.slice(metricsStart);
fs.writeFileSync('src/team.tsx',s);
s=fs.readFileSync('src/catalog.tsx','utf8').replace('className="patient-columns"','className="patient-columns library-layout"');fs.writeFileSync('src/catalog.tsx',s);
s=fs.readFileSync('src/main.tsx','utf8').replace("import './styles.css';","import './styles.css';\nimport './details.css';");fs.writeFileSync('src/main.tsx',s);
