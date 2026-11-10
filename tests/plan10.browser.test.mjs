import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

const path = name => fileURLToPath(new URL('../frontend/src/' + name, import.meta.url)).replaceAll('\\', '/');
const mockHooks = Object.fromEntries([
  ['features/catalog/hooks/useCategories.js', 'useCategories', 'categories'], ['features/catalog/hooks/useProducts.js', 'useProducts', 'products'],
  ['features/customers/hooks/useAgenda.js', 'useAgenda', 'agenda'], ['features/settings/hooks/useSettings.js', 'useSettings', 'settings'],
  ['features/branches/hooks/useBranches.js', 'useBranches', 'branches'], ['features/users/hooks/useUserManagement.js', 'useUserManagement', 'users'],
  ['features/reports/hooks/useReports.js', 'useReports', 'reports'], ['features/contracts/hooks/useContracts.js', 'useContracts', 'contracts'],
  ['features/sales/hooks/useSalesHistory.js', 'useSalesHistory', 'history'], ['hooks/useSuperAdmin.js', 'useSuperAdmin', 'admin'],
  ['features/cash-register/hooks/useCashRegister.js', 'useCashRegister', 'cash'], ['features/backups/hooks/useLocalBackup.js', 'useLocalBackup', 'backup'],
].map(([file, name, key]) => [path(file), `import {useSyncExternalStore} from 'react';
  export function ${name}(){useSyncExternalStore(next=>window.__p09.watch('${key}',next),()=>window.__p09.revisions['${key}']??0);return window.__p09.${key};}`]));
const moduleMocks = { ...mockHooks,
  [path('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p09-user"}};export const db={};',
  [path('features/notifications/hooks/useAlerts.js')]: 'export function useAlerts(){return {alerts:[],canViewNotifications:true};}',
  [path('features/reports/hooks/useExportSales.js')]: 'import {useSyncExternalStore} from "react"; export function useExportSales(){useSyncExternalStore(next=>window.__p09.watch("export",next),()=>window.__p09.revisions.export??0);return window.__p09.export;}',
  [path('features/contracts/hooks/useContractImageUrls.js')]: 'export function useContractImageUrls(){return {urls:[],isLoading:false,error:null};}',
  [path('features/payments/infrastructure/paymentRepository.js')]: 'export const getPaymentsByContract=async()=>window.__p09.ledger;',
  [path('features/licenses/infrastructure/platformBusinessRepository.js')]: 'export const readPlatformBusiness=async()=>window.__p09.platformDetail;',
  [path('features/sales/infrastructure/saleTransactions.js')]: `export const saveSaleTransaction=()=>window.__p09.forbidden();
    export const saveSaleDraftTransaction=()=>window.__p09.forbidden();export const verifyPendingSaleTransaction=async()=>{};
    export const subscribeSaleAcknowledgement=()=>()=>{};export const reviewDraftSaleTransaction=()=>window.__p09.forbidden();export const confirmDraftSaleTransaction=()=>window.__p09.forbidden();`,
};

it('P10 keeps operational UX compact, accessible and financially explicit in isolated Chromium', {timeout:180000}, async () => {
  const index = await readFile(new URL('../frontend/dist/index.html',import.meta.url),'utf8');
  const css = await readFile(new URL('../frontend/dist'+index.match(/href="([^"]+\.css)"/)[1],import.meta.url),'utf8');
  const checks=[], metrics=[], captures=[];
  await runBrowserFixture({htmlFile:new URL('./plan09.browser.html',import.meta.url),fixture:{css},moduleMocks,
    setupPage:page=>page.send('Fetch.enable',{patterns:[{urlPattern:'https://*',requestStage:'Request'}]}),
    inspectPage:async page=>{
      const ev=async(fn,...args)=>{const r=await page.send('Runtime.evaluate',{expression:`(${fn.toString()})(...${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,r.exceptionDetails?.exception?.description);return r.result.value;};
      const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
      const frames=()=>ev(()=>window.__p09.frames());
      const size=async(width,height)=>{await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await frames();};
      const show=async(name,role='dueño')=>check(!await ev(async(name,role)=>{await window.__p09.show(name,role);window.scrollTo(0,0);await window.__p09.frames();return window.__p09.renderError;},name,role),'renders '+name);
      const press=async(key,code=key)=>{const virtual={Enter:13,Escape:27,Tab:9,' ':32}[key];await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,text:key==='Enter'?'\r':undefined,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual});await frames();};
      const setInput=(selector,value)=>ev(async(selector,value)=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await window.__p09.frames();},selector,value);
      const click=label=>ev(async label=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label).click();await window.__p09.frames();},label);
      const fit=()=>ev(()=>document.documentElement.scrollWidth<=innerWidth+1);
      const shot=async name=>{await new Promise(r=>setTimeout(r,200));const r=await page.send('Page.captureScreenshot',{format:'png'});await mkdir('.release/p10-visual',{recursive:true});await writeFile('.release/p10-visual/after-'+name+'.png',Buffer.from(r.data,'base64'));captures.push(name);};
      const normal=()=>ev(async()=>{const m=window.__p09;m.cash.currentSession={id:'p09-session',userId:'p09-user',serverConfirmed:true};m.cash.isExpired=false;m.setBranch('p09-branch');m.notify('cash');Object.defineProperty(navigator,'onLine',{configurable:true,value:true});dispatchEvent(new Event('online'));await m.frames();});

      await size(1280,900);await normal();await show('pos');
      await ev(async()=>{const buttons=[...document.querySelectorAll('[aria-label="Catálogo de productos"] button')].filter(b=>b.title.startsWith('Producto'));for(const b of buttons.slice(0,8)){b.click();await window.__p09.frames();}});
      check(await ev(()=>document.querySelectorAll('aside[aria-label="Ticket"] button[aria-label^="Quitar"]').length===8&&document.querySelector('button[title="Producto de prueba 8"]').disabled),'eight-product guard survives; no ninth product can be added');
      for(const width of [320,390,768,1024,1280,1440])for(const height of [560,700,900]){
        await size(width,height);await normal();await show('pos');
        check(await fit(),`POS no horizontal overflow ${width}/${height}`);
        if(width>=1024){
          const b=await ev(()=>{const ticket=document.querySelector('aside[aria-label="Ticket"]'),cta=ticket.querySelector('.pos-ticket-actions'),catalog=document.querySelector('.pos-catalog'),items=ticket.querySelector('.pos-ticket-items');return {cta:cta.getBoundingClientRect().bottom,total:ticket.querySelector('.pos-ticket-total').getBoundingClientRect().bottom,top:ticket.getBoundingClientRect().top,height:ticket.clientHeight,catalogHeight:catalog.clientHeight,items:items.scrollHeight>items.clientHeight,header:document.querySelector('.pos-toolbar').clientHeight};});
          check(b.cta<=height+1&&b.total<=height+1&&b.header<=60&&Math.abs(b.height-b.catalogHeight)<2,`compact header, full-height ticket and visible CTA ${width}/${height}: ${JSON.stringify(b)}`);
          check(b.items,`eight ticket lines scroll independently ${width}/${height}`);
          check(await ev(()=>{const c=document.querySelector('.pos-catalog');c.scrollTop=600;return c.scrollTop>0&&document.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom<=innerHeight;}),`catalogue scroll does not displace checkout ${width}/${height}`);
        }else{
          check(await ev(()=>document.querySelector('.pos-cart-launcher').getBoundingClientRect().bottom<=document.querySelector('.app-bottom-nav').getBoundingClientRect().top),'ticket launcher clears mobile navigation');
          await ev(async()=>{document.querySelector('.pos-cart-launcher').click();await window.__p09.frames();});
          check(await ev(()=>{const d=document.querySelector('[role="dialog"]');return d.getBoundingClientRect().bottom<=innerHeight+1&&d.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom<=innerHeight+1;}),`drawer total/checkout fit ${width}/${height}`);
          await press('Escape');
        }
      }
      await size(1280,560);await normal();await show('pos');
      await ev(async()=>{window.__p09.setBranch('global');await window.__p09.frames();});
      check(await ev(()=>{const root=document.querySelector('.pos-workspace'),banner=[...root.querySelectorAll('[role="status"]')].find(p=>p.textContent.includes('Vista global'));return banner&&banner.clientHeight<80&&root.innerText.includes('Solo lectura')&&[...root.querySelectorAll('.pos-catalog button[title]')].every(b=>b.disabled)&&[...root.querySelectorAll('button')].find(b=>b.textContent==='Modo lectura').disabled;}),'global view stays explicitly read-only with compact warning and blocked operations');
      await normal();await ev(async()=>{window.__p09.cash.currentSession=null;window.__p09.notify('cash');await window.__p09.frames();});
      check(await ev(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Abrir caja para vender'&&!b.disabled)&&document.querySelector('button[title="Producto de prueba 0"]').disabled),'closed cash disables products and offers the unchanged opening action');
      await normal();await ev(async()=>{window.__p09.cash.isExpired=true;window.__p09.notify('cash');await window.__p09.frames();});
      check(await ev(()=>document.querySelector('main').innerText.includes('Caja vencida')&&[...document.querySelectorAll('.pos-ticket-actions button')].every(b=>b.disabled)),'expired session cannot charge');
      await normal();await ev(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));await window.__p09.frames();});
      check(await ev(()=>document.querySelector('main').innerText.includes('Guardar sin cobrar')&&document.querySelector('main').innerText.includes('No se moverá inventario')&&document.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom<=innerHeight),'offline stays an uncharged draft, with CTA inside the viewport');
      await normal();await size(640,450);await show('pos');await ev(async()=>{document.querySelector('.pos-cart-launcher').click();await window.__p09.frames();});
      check(await fit()&&await ev(()=>document.querySelector('[role="dialog"] .pos-ticket-actions').getBoundingClientRect().bottom<=innerHeight),'200% equivalent reflow and landscape keep the checkout reachable');await press('Escape');
      await size(1280,560);await show('pos');
      check(await ev(()=>[...document.querySelectorAll('[aria-label="Navegación de escritorio"] button')].find(b=>b.textContent.includes('Cerrar sesión')).getBoundingClientRect().bottom<=innerHeight),'sidebar scroll is independent and logout remains reachable');
      await ev(()=>document.querySelector('[aria-label="Módulos"] button').focus());await press('Tab');
      check(await ev(()=>document.activeElement.matches(':focus-visible')&&getComputedStyle(document.activeElement).outlineStyle!=='none'),'keyboard navigation retains a visible focus indicator');

      const summaries=[['match',30,0,false,'Coincide','text-success'],['short',25,-5,false,'Faltan S/ 5.00','text-danger'],['extra',35,5,false,'Sobran S/ 5.00','text-warning'],['provisional',25,-5,true,'Por revisar','text-warning']];
      for(const width of [1440,320])for(const [name,counted,difference,provisional,label,color] of summaries){
        await size(width,width===320?560:900);
        await ev((counted,difference,provisional)=>{window.__p09.countSummary={openingAmount:10,posCash:20,contractCash:0,expectedAmount:30,declaredAmount:counted,difference,hasUnverifiedDisbursements:provisional,posCompensationCount:provisional?1:0};},counted,difference,provisional);await show('cash-summary');
        check(await ev((label,color,provisional)=>{const d=document.querySelector('[role="dialog"]'),details=d.querySelector('details');return d.innerText.includes(label)&&d.querySelector('.'+color)&&!details.open&&details.querySelector('summary').textContent==='Ver detalle del cuadre'&&(!provisional||(!d.innerText.includes('Faltan')&&!d.innerText.includes('Sobran')&&d.innerText.includes('Referencia calculada')));},label,color,provisional),'cash summary '+name+' preserves reliable/provisional semantics at '+width);
        check(await fit(),`cash ${name} fits ${width}`);await shot(`cash-${name}-${width}`);
        await ev(()=>document.querySelector('[role="dialog"] summary').focus());await press(' ' ,'Space');
        check(await ev(()=>document.querySelector('details').open&&document.querySelector('[role="dialog"]').innerText.includes('no registrados no forman parte')&&!document.querySelector('[role="dialog"]').innerText.includes('Gastos: S/')),'keyboard reveals detail without inventing expenses');
      }
      await ev(()=>{window.__p09.countSummary={openingAmount:0,posCash:0,contractCash:0,expectedAmount:-30,declaredAmount:0,difference:30};});await show('cash-summary');
      check(await ev(()=>{const d=document.querySelector('[role="dialog"]');return d.innerText.includes('Por revisar')&&!d.innerText.includes('Sobran')&&!d.innerText.includes('Faltan');}),'a negative reference never announces physical excess or shortage');
      await size(390,700);await ev(()=>{const m=window.__p09;m.openCalls=[];m.openRegister=async amount=>{m.openCalls.push(amount);return false;};});await show('cash-open');await setInput('[role="dialog"] input','10.05');await click('Abrir caja');
      check(await ev(()=>window.__p09.openCalls[0]===10.05&&document.querySelector('[role="dialog"] input').value==='10.05'),'opening cents pass unchanged and a failed opening retains input');
      await setInput('[role="dialog"] input','0.001');await click('Abrir caja');
      check(await ev(()=>window.__p09.openCalls.length===1&&!document.querySelector('[role="dialog"] input').checkValidity()),'opening rejects extra decimals without silent rounding');
      await ev(()=>{const m=window.__p09;m.closeCalls=0;m.calculateClose=async amount=>({openingAmount:10,posCash:20,contractCash:0,expectedAmount:30,declaredAmount:amount,difference:-5});m.confirmClose=async()=>{m.closeCalls++;return new Promise(resolve=>{m.resolveClose=resolve;});};});await show('cash-close');await setInput('[role="dialog"] input','25.00');await click('Siguiente');
      await setInput('[role="dialog"] textarea','abcd');await click('Cerrar turno');
      check(await ev(()=>window.__p09.closeCalls===0),'nonzero difference still requires at least five observation characters');
      await setInput('[role="dialog"] textarea','Conteo por revisar');await click('Cerrar turno');await click('Cerrar turno');await press('Escape');
      check(await ev(()=>window.__p09.closeCalls===1&&Boolean(document.querySelector('[role="dialog"]'))&&document.querySelector('[role="dialog"] textarea').matches(':disabled')),'close locks duplicate submission and Escape during processing');
      await ev(async()=>{window.__p09.resolveClose(false);await window.__p09.frames();});
      check(await ev(()=>document.querySelector('[role="dialog"] textarea').value==='Conteo por revisar'&&!document.querySelector('[role="dialog"] textarea').matches(':disabled')),'failed closing retains observation and permits an explicit retry');
      for(const [width,height] of [[390,700],[320,560],[1280,560]]){
        await size(width,height);
        const action=await ev(()=>({button:Math.max(...[...document.querySelectorAll('[role="dialog"] button')].map(b=>b.getBoundingClientRect().bottom)),panel:document.querySelector('[role="dialog"]').getBoundingClientRect().bottom}));
        await shot(`cash-confirm-${width}`);
        check(action.button<=height&&action.button<=action.panel,`cash confirmation footer stays visible ${width}/${height}: ${JSON.stringify(action)}`);
      }

      await size(1440,900);await show('operationalHistory');
      check(await ev(()=>window.__p09.exportCalls.length===0&&!document.querySelector('.export-toolbar input[type="checkbox"]')&&!document.querySelector('.export-toolbar details').open),'export mount needs no checkbox and performs no query');
      await ev(async()=>{const select=document.querySelector('.export-toolbar select');select.value='mes';select.dispatchEvent(new Event('change',{bubbles:true}));await window.__p09.frames();});
      check(await ev(()=>window.__p09.exportCalls.length===0),'changing the period does not query');await click('Descargar Excel');
      check(await ev(()=>JSON.stringify(window.__p09.exportCalls)==='[["all","mes"]]'),'explicit download preserves the exact hook arguments and chosen period');
      await ev(async()=>{Object.assign(window.__p09.export,{isExporting:true,phase:'integrity'});window.__p09.notify('export');await window.__p09.frames();});await click('Descargar Excel');
      check(await ev(()=>window.__p09.exportCalls.length===1&&document.querySelector('.export-toolbar select').disabled),'busy export blocks repeat downloads and period changes');
      await ev(async()=>{Object.assign(window.__p09.export,{isExporting:false,phase:'error',failure:{kind:'data-read',error:{code:'permission-denied',message:'isolated-denial'}}});window.__p09.notify('export');await window.__p09.frames();});
      check(await ev(()=>document.querySelector('.export-toolbar').innerText.includes('Tu cuenta no pudo acceder')),'export permission errors remain visible outside the disclosure');
      await ev(()=>{Object.assign(window.__p09.export,{phase:'idle',failure:null});window.__p09.notify('export');const m=window.__p09;m.history.sales=[m.makeSale('confirmed','confirmed'),m.makeSale('draft','draft_offline'),m.makeSale('uncertain','submitted_uncertain'),{...m.makeSale('voided','confirmed'),voided:true,voidReason:'Motivo conservado'},{...m.makeSale('voidPending','confirmed'),voidCheckPending:true}];});await show('operationalHistory');
      check(await ev(()=>['Venta registrada','Sin cobrar','Por comprobar','Venta anulada','Comprobando anulación'].every(text=>[...document.querySelectorAll('article header')].some(h=>h.textContent.includes(text)))),'all five active financial states retain distinct labels');
      check(await ev(()=>document.querySelector('article[aria-label$="draft"]').innerText.includes('Importe guardado')&&document.querySelector('article[aria-label$="voided"]').innerText.includes('Motivo conservado')&&document.querySelector('.sales-history').innerText.includes('no suman ingresos')),'drafts are not income and void reasons remain visible');
      check(await ev(()=>[...document.querySelectorAll('.sales-history>details')].some(d=>!d.open&&d.textContent.includes('Revisión local'))),'historical rejections remain in secondary local review');
      await ev(()=>{window.__p09.history.sales[0].items=Array.from({length:8},(_,i)=>({id:'long-'+i,qty:1,price:5,name:'Producto '+i}));});await show('operationalHistory');
      check(await ev(()=>document.querySelector('article ul').children.length===3),'long tickets show a compact first three products');
      await ev(()=>[...document.querySelectorAll('article summary')].find(el=>el.textContent.includes('productos más')).focus());await press('Enter');
      const expanded=await ev(()=>{const d=[...document.querySelectorAll('article details')].find(d=>d.textContent.includes('productos más'));return {open:d.open,items:d.querySelectorAll('li').length,active:document.activeElement.textContent};});
      check(expanded.open&&expanded.items===5,'all remaining ticket items are keyboard-accessible: '+JSON.stringify(expanded));
      await ev(()=>{window.__p09.history.isStale=true;});await show('history');
      check(await ev(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent==='Anular ticket').every(b=>b.disabled)),'stale history cannot submit voids');
      await ev(()=>{const m=window.__p09;m.history.isStale=false;m.history.sales=[{...m.makeSale('foreign','confirmed'),branchId:'other-branch'}];});await show('history','cajero');
      check(await ev(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Anular ticket')),'cashier cannot void a different branch ticket');

      for(const width of [320,390,768,1024,1280,1440]){
        await size(width,700);await ev(()=>{const m=window.__p09;m.history.sales=Array.from({length:10},(_,i)=>m.makeSale('grid-'+i,'confirmed'));});await show('operationalHistory');
        const b=await ev(()=>({columns:getComputedStyle(document.querySelector('.history-grid')).gridTemplateColumns.split(' ').length,excel:document.querySelector('.export-controls').clientHeight,first:document.querySelector('article').getBoundingClientRect().top}));
        check(await fit(),`history/Excel reflow ${width}`);
        check(b.columns===(width>=1280?3:width>=1024?2:width>=768?2:1),`history uses the actual content width at ${width}: ${b.columns} columns`);
        check(b.excel<=(width>=768?160:240),`compact Excel height ${width}: ${b.excel}`);
        if(width>=1024)check(b.first<300,'tickets appear before an unnecessary page scroll');
      }
      await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await show('pos');
      check(await ev(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.pos-cart-launcher')).animationName==='none'),'reduced motion is respected');
      for(const width of [1440,390]){
        await size(width,width===390?700:900);await normal();
        for(const name of ['pos-open','pos-global','pos-closed','history-1','history-3','history-10']){
          await ev(async name=>{const m=window.__p09;m.cash.currentSession=name==='pos-closed'?null:{id:'p09-session',userId:'p09-user',serverConfirmed:true};m.notify('cash');m.setBranch(name==='pos-global'?'global':'p09-branch');m.history.sales=Array.from({length:Number(name.split('-')[1])||3},(_,i)=>m.makeSale('p10-'+i,'confirmed'));await m.frames();},name);
          await show(name.startsWith('history')?'operationalHistory':'pos');
          if(name==='pos-open')await ev(async()=>{const b=document.querySelector('button[title="Producto de prueba 0"]');b.click();await window.__p09.frames();});
          await shot(`${name}-${width}`);
          metrics.push(await ev((name,width)=>({name,width,header:document.querySelector('main h1')?.getBoundingClientRect().height,exportHeight:document.querySelector('.export-toolbar')?.clientHeight,checkoutBottom:document.querySelector('.pos-ticket-actions')?.getBoundingClientRect().bottom,firstTicket:document.querySelector('article')?.getBoundingClientRect().top}),name,width));
        }
      }
      await normal();await ev(()=>window.__p09.stop());
    }});
  await writeFile('.release/p10-visual/after-metrics.json',JSON.stringify(metrics,null,2));
  console.log(JSON.stringify({checks:checks.length,captures:captures.length,financialWrites:0}));
});


