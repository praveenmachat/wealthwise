import {safe,identify,body,originCheck,load,commit,json,db,error,requestId,limit} from '../../server/core.mjs';
import {mutate,applyProposal} from '../../public/domain.mjs';
export default safe(async req=>{
 const user=await identify(req),row=await load(user.id);
 if(req.method==='GET'){const [c]=await db('ww_connections?select=last_sync,email&user_id=eq.'+user.id);return json({...row,connections:{gmailConnected:!!c,lastSync:c?.last_sync||null}});}
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 originCheck(req);await limit(user.id,'writes',120);const b=await body(req),id=requestId(b.requestId);
 if(row.data.audit.some(a=>a.id===id))return json(row);
 if(b.revision!==row.revision)throw error('Refresh to load the latest changes before saving.',409);
 let next;
 try{
 if(b.decision){const p=row.data.proposals.find(p=>p.id===b.proposalId&&p.status==='pending');if(!p)throw error('Proposal is no longer pending.',409);
 if(b.decision==='approve'){
 let current=row.data;
 if(b.data){if(p.command.action!=='asset.save')throw error('Only account proposals support edited approval.');current=structuredClone(row.data);current.proposals.find(x=>x.id===p.id).command={...p.command,data:b.data};}
 next=applyProposal(current,p.id,{id,now:new Date().toISOString()});
 }
 else if(b.decision==='revise'){
 if(p.command.action!=='asset.save'||!b.data)throw error('Only account proposals can be edited.');
 const command={...p.command,data:b.data};
 mutate(row.data,command,{id,now:new Date().toISOString()});
 next=structuredClone(row.data);next.proposals.find(x=>x.id===p.id).command=command;
 next.audit.unshift({id,at:new Date().toISOString(),action:'proposal.revise',source:'manual',before:p.command,after:command});
 }
 else if(b.decision==='dismiss'){next=structuredClone(row.data);next.proposals.find(x=>x.id===p.id).status='dismissed';next.audit.unshift({id,at:new Date().toISOString(),action:'proposal.dismiss',source:'manual',before:p,after:null});}
 else throw error('Invalid review decision.');
 }else next=mutate(row.data,b.command,{id,now:new Date().toISOString()});
 }catch(e){throw error(e.message,e.status||400);}
 return json(await commit(user.id,next,row.revision));
});
export const config={path:'/api/workspace'};

