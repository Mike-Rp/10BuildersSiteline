import fs from "node:fs";
import cp from "node:child_process";
import crypto from "node:crypto";
const tracked=cp.execFileSync("git",["ls-files"],{encoding:"utf8"}).trim().split(/\r?\n/);
const files=tracked.filter(p=>/\.(tsx?|m?js|css)$/.test(p)&&fs.existsSync(p));
const facts={environmentFiles:[],environmentReferences:{},largeFiles:[],criticalAny:[],ignoredErrors:[],secretLocations:[],supabaseBrowserReferences:[],legacyReferences:[],sourceHashesUnchanged:true};
for(const path of [".env",".env.local",".env.example","Thesis-Backend/.env","Thesis-Backend/.env.example"]){
 if(!fs.existsSync(path)){facts.environmentFiles.push({path,exists:false});continue;}
 const entries=fs.readFileSync(path,"utf8").split(/\r?\n/).flatMap((line,i)=>{const m=/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/.exec(line);return m?[{name:m[1],line:i+1,configured:!!m[2].trim(),secret:/SECRET|PASSWORD|KEY|TOKEN/.test(m[1])}]:[];});
 facts.environmentFiles.push({path,tracked:tracked.includes(path),entries});
 for(const e of entries.filter(e=>e.secret&&e.configured&&!path.endsWith(".example")))facts.secretLocations.push({path,line:e.line,value:"[MASKED]",tracked:tracked.includes(path)});
}
for(const path of files){
 const text=fs.readFileSync(path,"utf8"),lines=text.split(/\r?\n/);
 if(lines.length>700)facts.largeFiles.push({path,lines:lines.length,bytes:Buffer.byteLength(text)});
 lines.forEach((line,i)=>{
 for(const match of line.matchAll(/(?:process|import\.meta)\.env(?:\?\.)?\.?([A-Z][A-Z0-9_]*)/g))(facts.environmentReferences[match[1]]??=[]).push(path+":"+(i+1));
 if(path.startsWith("src/")&&/supabase|createClient\(/i.test(line))facts.supabaseBrowserReferences.push({path,line:i+1});
 if(/@ts-ignore|@ts-nocheck|eslint-disable/.test(line))facts.ignoredErrors.push({path,line:i+1});
 if((path.startsWith("src/api/")||path==="src/App.tsx"||path==="src/RoleWorkspace.tsx")&&/\bany\b|as unknown|as Account|as State|as Project/.test(line))facts.criticalAny.push({path,line:i+1,kind:/\bany\b/.test(line)?"any":"cast"});
 if(path.startsWith("src/")&&/Demo Session|Demo Access|initialState|PHASES|DISCIPLINES/.test(line))facts.legacyReferences.push({path,line:i+1});
 if(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|(?:sb_secret_|sb_publishable_|sk_live_)[A-Za-z0-9_-]{12,}/.test(line))facts.secretLocations.push({path,line:i+1,value:"[MASKED]",tracked:tracked.includes(path)});
 });
}
facts.largeFiles.sort((a,b)=>b.lines-a.lines);
facts.envHistory=cp.execFileSync("git",["log","--all","--format=%h","--name-only","--",".env","Thesis-Backend/.env"],{encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
facts.tools={node:process.version};
fs.writeFileSync(new URL("./static-results.json",import.meta.url),JSON.stringify(facts,null,2));
console.log(JSON.stringify({environmentFiles:facts.environmentFiles,largeFiles:facts.largeFiles.slice(0,7),criticalAnyCount:facts.criticalAny.length,browserSupabaseReferences:facts.supabaseBrowserReferences,envHistory:facts.envHistory}));
