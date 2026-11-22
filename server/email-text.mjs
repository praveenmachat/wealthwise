import {parseHTML} from 'linkedom';
export function emailText(html){
 const {document}=parseHTML(html);
 for(const node of document.querySelectorAll('script,style'))node.remove();
 for(const node of document.querySelectorAll('td,th'))node.append(' | ');
 for(const node of document.querySelectorAll('tr,p,div,br'))node.append('\n');
 return document.body?.textContent||document.textContent;
}

