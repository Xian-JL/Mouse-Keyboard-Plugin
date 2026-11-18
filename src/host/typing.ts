import type {WindowIdentity,ElementInfo} from '../shared/contracts.js';
// Deliberately narrow: opt-in cannot turn an ambiguous target into a plain editor.
export function typoEligible(w:WindowIdentity,f:ElementInfo|undefined,text:string):boolean {
 const app=w.app.toLowerCase();if(!['notepad.exe','wordpad.exe'].includes(app)||/\.(?:ps1|bat|cmd|sh|py|js|ts|sql|reg)\b/i.test(w.title))return false;
 if(!f||!f.editable||f.password||!f.enabled||f.valueTruncated||f.valueUnavailable||typeof f.value!=='string')return false;
 if(!Number.isInteger(f.selectionStart)||!Number.isInteger(f.selectionEnd)||f.selectionStart!<0||f.selectionEnd!<f.selectionStart!||f.selectionEnd!>f.value.length)return false;
 if(!/^[A-Za-z ,.!?'\-]+$/.test(text)||/^(?:exit|quit|logout|sudo|cd|ls|dir|echo|rm|del|mkdir|rmdir|copy|move|curl|wget|git|npm|pnpm|node|python|pip|cmd|powershell|pwsh|bash|sh|ssh|set|export|start|shutdown|reboot)\b/i.test(text.trim()))return false;
 return true;
}
