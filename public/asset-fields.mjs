const accountTypes={
 bank:['Bank name','Account number'],fd:['Bank name','Deposit reference'],
 loan:['Lender / bank','Loan account reference'],card:['Card issuer / bank','Card last four digits'],
 stock:['Broker','ISIN / security reference'],fund:['Fund provider / AMC','Folio / investment reference'],
 insurance:['Insurance provider','Policy number']
};
export function configureAssetFields(form){
 const type=form.elements.type.value;
 function field(name,visible,labelText){
   const input=form.elements[name];if(!input)return;
   const label=form.querySelector('label[for="'+input.id+'"]');
   input.hidden=!visible;input.disabled=!visible;if(label){label.hidden=!visible;if(labelText)label.textContent=labelText;}
   if(name==='coverage')input.parentElement.hidden=!visible;
 }
 const account=accountTypes[type];
 field('institution',!!account,account?.[0]+' (optional)');
 field('accountRef',!!account,account?.[1]+' (optional)');
 field('branch',['bank','fd','loan'].includes(type));
 field('iban',type==='bank');
 field('coverage',type==='insurance');
 const help=form.querySelector('[data-insurance-help]');if(help)help.hidden=type!=='insurance';
 for(const [id,kind]of [['loan-fields','loan'],['card-fields','card']]){
   const group=form.querySelector('#'+id);if(group){group.hidden=type!==kind;group.disabled=type!==kind;}
 }
 const amount=form.elements.amount,label=form.querySelector('label[for="'+amount.id+'"]');
 if(label)label.textContent=type==='loan'?'Outstanding loan balance':type==='card'?'Outstanding balance / statement amount due':type==='insurance'?'Cash / surrender value':type==='property'?'Current property value':'Current value / balance';
 const notes=form.elements.notes,noteLabel=form.querySelector('label[for="'+notes.id+'"]');
 if(noteLabel)noteLabel.textContent=({property:'Property location and notes',vehicle:'Vehicle details and notes',metal:'Metal, weight and purity notes'}[type]||'Notes');
}

