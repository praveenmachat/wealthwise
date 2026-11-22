export function inrAmount(amount,currency,fx){
 if(currency==='INR')return amount;
 const rate=fx?.rates?.[currency];
 if(!Number.isFinite(rate)||rate<=0)return null;
 const converted=Math.round(amount*rate);
 return Number.isSafeInteger(converted)?converted:null;
}

