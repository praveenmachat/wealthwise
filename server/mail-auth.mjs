// Only Gmail's first Authentication-Results header, with the sender domain aligned.
// A failed check routes the statement to human review instead of auto-saving.
export function authenticatedSender(headers,sender){
 const result=headers.find(h=>h.name.toLowerCase()==='authentication-results')?.value||'';
 const domain=sender.split('@')[1]?.toLowerCase();if(!domain||!/^\s*mx\.google\.com\s*;/i.test(result))return false;
 const sections=result.split(';').slice(1);
 const dmarc=sections.find(s=>/^\s*dmarc=pass\b/i.test(s));
 const dkim=sections.filter(s=>/^\s*dkim=pass\b/i.test(s));
 const from=dmarc?.match(/\bheader\.from=([^\s;]+)/i)?.[1]?.toLowerCase();
 return from===domain&&dkim.some(s=>{
 const signer=s.match(/\bheader\.d=([^\s;]+)/i)?.[1]||s.match(/\bheader\.i=[^\s;]*@([^\s;]+)/i)?.[1];
 return signer?.toLowerCase()===domain;
 });
}

