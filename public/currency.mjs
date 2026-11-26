export function inrAmount(amount,currency,fx){
 return convertedAmount(amount,currency,'INR',fx);
}


export function convertedAmount(amount, from, to, fx){
 if(from===to||amount===0)return amount;
 const sourceRate=from==='INR'?1:fx?.rates?.[from];
 const targetRate=to==='INR'?1:fx?.rates?.[to];
 if(!Number.isFinite(sourceRate)||sourceRate<=0||!Number.isFinite(targetRate)||targetRate<=0)return null;
 const converted=Math.round(amount*sourceRate/targetRate);
 return Number.isSafeInteger(converted)?converted:null;
}
