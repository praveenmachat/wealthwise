const selected=new WeakMap();
let previewUrl;
export function pastedImage(data){
 for(const item of Array.from(data?.items||[]))if(item.kind==='file'&&item.type.startsWith('image/')){const file=item.getAsFile();if(file)return file;}
 return null;
}
export function selectedImage(form){return selected.get(form)||form.querySelector('input[type=file]')?.files?.[0];}
export function installImagePaste({notify}){
 const active=()=>{const dialog=document.querySelector('#dialog');return dialog?.open?dialog.querySelector('#asset-image-form,#receipt-form'):null;};
 const release=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
 const choose=(form,file)=>{
   if(!file?.type.startsWith('image/'))throw new Error('Copy an image or choose an image file.');
   if(file.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
   selected.set(form,file);for(const input of form.querySelectorAll('input[type=file]')){input.value='';input.required=false;}
   release();previewUrl=URL.createObjectURL(file);
   let preview=form.querySelector('[data-image-preview]');
   if(!preview){preview=document.createElement('div');preview.dataset.imagePreview='';form.querySelector('.upload-zone').append(preview);}
   preview.replaceChildren();
   const img=document.createElement('img');img.src=previewUrl;img.alt='Selected image preview';img.style.cssText='display:block;max-width:100%;max-height:220px;margin:12px auto;object-fit:contain';
   const status=document.createElement('p');status.setAttribute('role','status');status.textContent=(file.name||'Pasted image')+' ready. Review it, then choose Scan and review or Read bill.';
   preview.append(img,status);
 };
 document.addEventListener('paste',event=>{
   const form=active();if(!form)return;const file=pastedImage(event.clipboardData);if(!file)return;
   event.preventDefault();try{choose(form,file);}catch(e){notify(e.message);}
 });
 document.addEventListener('change',event=>{
   const form=active();if(!form||!form.contains(event.target)||event.target.type!=='file')return;
   const file=event.target.files?.[0];if(file)try{choose(form,file);}catch(e){notify(e.message);}
 });
 document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-paste-image]');if(!button)return;
   const form=active();if(!form)return;
   button.disabled=true;
   try{
     if(!navigator.clipboard?.read)throw new Error('Use Ctrl+V (or Command+V) to paste, or choose an image file.');
     const items=await navigator.clipboard.read();
     for(const item of items){const type=item.types.find(type=>type.startsWith('image/'));if(type){const blob=await item.getType(type);if(active()!==form)return;choose(form,new File([blob],'Pasted screenshot.'+(type==='image/png'?'png':'jpg'),{type}));return;}}
     throw new Error('No image found. Copy the screenshot itself, then paste again.');
   }catch(e){notify(e.name==='NotAllowedError'?'Clipboard access was blocked. Press Ctrl+V (or Command+V), or choose a file.':e.message);}
   finally{button.disabled=false;}
 });
 document.querySelector('#dialog').addEventListener('close',release);
}

