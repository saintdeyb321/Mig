import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readBrowserBuildCss, runBrowserFixture } from './helpers/browserHarness.mjs';

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

it('P10-06 preserves full payment focus, article space, fixed identity and compact sale cards', {timeout:180000}, async()=>{
  const css=await readBrowserBuildCss();
  const artifacts=(process.env.MIGAPOS_TEST_ARTIFACT_DIR || '.release')+'/p10-06-visual';
  // Measured rejected P10 reference at 1440x900, eight fixture products, cash not entered.
  const before={ticket:{items:327}};
  const checks=[],metrics=[],captures=[],historyMetrics=[],historyFailures=[];
  try {
    await runBrowserFixture({htmlFile:new URL('./plan09.browser.html',import.meta.url),fixture:{css},moduleMocks,
    setupPage:page=>page.send('Fetch.enable',{patterns:[{urlPattern:'https://*',requestStage:'Request'}]}),
    inspectPage:async page=>{
      const ev=async(fn,...args)=>{const r=await page.send('Runtime.evaluate',{expression:`(${fn.toString()})(...${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,r.exceptionDetails?.exception?.description);return r.result.value;};
      const check=(yes,label)=>{assert.ok(yes,label);checks.push(label);};
      const platformFonts=async()=>{
        try {
          await page.send('DOM.enable');
          await page.send('CSS.enable');
          const {root}=await page.send('DOM.getDocument');
          return Object.fromEntries(await Promise.all(['header p','footer p span'].map(async selector=>{
            const {nodeId}=await page.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.sale-history-card '+selector});
            const {fonts}=await page.send('CSS.getPlatformFontsForNode',{nodeId});
            return [selector,fonts.map(font=>font.familyName)];
          })));
        } catch(error) { return {unavailable:error.message}; }
      };
      const frames=()=>ev(()=>window.__p09.frames());
      const size=async(width,height)=>{await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await frames();};
      const key=async(key,code=key,virtual)=>{await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual});await frames();};
      const show=async(name,role='dueño')=>check(!await ev(async(name,role)=>{await window.__p09.show(name,role);window.scrollTo(0,0);await window.__p09.frames();return window.__p09.renderError;},name,role),'render '+name);
      const shot=async(name)=>{await new Promise(r=>setTimeout(r,180));const p=await page.send('Page.captureScreenshot',{format:'png'});await mkdir(artifacts,{recursive:true});await writeFile(artifacts+'/after-'+name+'.png',Buffer.from(p.data,'base64'));captures.push(name);};
      const cart=async count=>ev(async count=>{
        const m=window.__p09;m.cash.currentSession={id:'p09-session',serverConfirmed:true,userId:'p09-user'};m.cash.isExpired=false;m.notify('cash');m.setBranch('p09-branch');await m.frames();
        for(const b of document.querySelectorAll('aside[aria-label="Ticket"] button[aria-label^="Quitar"]')){b.click();await m.frames();}
        const buttons=[...document.querySelectorAll('.pos-catalog button[title]')];for(const b of buttons.slice(0,count)){b.click();await m.frames();}
      },count);
      const openDrawer=async(width)=>{if(width<1024)await ev(async()=>{document.querySelector('.pos-cart-launcher').click();await window.__p09.frames();});};
      const selectPayment=method=>ev(async method=>{
        const ticket=document.querySelector('[role="dialog"] .pos-ticket')||document.querySelector('aside[aria-label="Ticket"] .pos-ticket');
        const label={efectivo:'Efectivo',yape:'Yape / Plin',mixto:'Mixto'}[method];
        [...ticket.querySelectorAll('[aria-label="Método de pago"] button')].find(button=>button.textContent===label).click();
        await window.__p09.frames();
      },method);
      const input=async(index,text)=>ev(async(index,text)=>{const root=document.querySelector('[role="dialog"] .pos-ticket')||document.querySelector('aside[aria-label="Ticket"] .pos-ticket');const i=root.querySelectorAll('input[inputmode="decimal"]')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,text);i.dispatchEvent(new Event('input',{bubbles:true}));await window.__p09.frames();},index,text);
      const focused=async index=>ev(async index=>{
        const root=document.querySelector('[role="dialog"] .pos-ticket')||document.querySelector('aside[aria-label="Ticket"] .pos-ticket'),i=root.querySelectorAll('input[inputmode="decimal"]')[index];i.focus();await window.__p09.frames();
        const field=i.getBoundingClientRect(),p=root.querySelector('.pos-ticket-payment').getBoundingClientRect();return{field:[field.top,field.bottom],payment:[p.top,p.bottom],height:p.height,cta:root.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom,total:root.querySelector('.pos-ticket-total').getBoundingClientRect().bottom,ticketBottom:root.getBoundingClientRect().bottom,viewport:innerHeight,active:document.activeElement===i};
      },index);
      const assertFocus=(m,label)=>check(m.active&&m.field[0]>=m.payment[0]-1&&m.field[1]<=m.payment[1]+1&&m.cta<=Math.min(m.viewport,m.ticketBottom)+1&&m.total<=Math.min(m.viewport,m.ticketBottom)+1,`${label}: ${JSON.stringify(m)}`);

      for(const [width,height]of [[1440,900],[1024,768],[390,844],[320,560]]){
        await size(width,height);await show('pos');
        for(const count of [0,1,5,8]){
          await cart(count);if(count===0&&width<1024)await shot('pos-page-'+width);await openDrawer(width);
          for(const method of ['efectivo','yape','mixto']){
            await selectPayment(method);
            const b=await ev(()=>{const r=document.querySelector('[role="dialog"] .pos-ticket')||document.querySelector('aside[aria-label="Ticket"] .pos-ticket');return{items:r.querySelector('.pos-ticket-items').clientHeight,payment:r.querySelector('.pos-ticket-payment').clientHeight,counter:r.querySelector('.pos-ticket-heading').textContent,body:r.textContent,scroll:document.documentElement.scrollWidth,viewport:innerWidth};});
            check(b.counter.includes(`${count} ${count===1?'producto':'productos'}`)&&!b.body.includes('Límite por ticket')&&!b.body.includes('operación atómica verificada'),`simple counter and no permanent technical text ${width}/${count}/${method}`);
            check(b.scroll<=b.viewport+1,`no horizontal overflow ${width}/${count}/${method}`);
            if(width===1440&&count===8&&method==='efectivo'){
              check(b.items>before.ticket.items+32&&b.items>b.payment,`article area grows over rejected P10: ${b.items} vs ${before.ticket.items}`);metrics.push({case:'full-desktop',...b});
            }
            if(method==='efectivo'){
              if(count===0||count===8)await shot(`${count?'pos-full':'pos-open'}-${width}`);
              await input(0,count?'100.00':'0.00');assertFocus(await focused(0),`cash full focus ${width}/${count}`);
              check(await ev(()=>{const r=document.querySelector('[role="dialog"] .pos-ticket')||document.querySelector('aside[aria-label="Ticket"] .pos-ticket'),i=r.querySelector('input[inputmode="decimal"]');return i.getAttribute('aria-describedby').split(' ').some(id=>document.getElementById(id)?.textContent.includes('dos decimales'));}),'cash guidance remains accessible to assistive technology');
            }else if(method==='mixto'){
              await input(0,count?'1.00':'0.00');assertFocus(await focused(0),`mixed cash full focus ${width}/${count}`);assertFocus(await focused(1),`mixed digital full focus ${width}/${count}`);
            }else check(await ev(()=>{const r=document.querySelector('[role="dialog"] .pos-ticket')||document.querySelector('aside[aria-label="Ticket"] .pos-ticket');return r.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom<=innerHeight+1;}),'digital checkout remains reachable');
          }
          if(width<1024)await key('Escape','Escape',27);
          if(count===8)check(await ev(()=>document.querySelector('button[title="Producto de prueba 8"]').disabled),'ninth distinct product remains blocked');
        }
        for(const mode of ['global','closed']){
          await ev(async mode=>{const m=window.__p09;m.setBranch(mode==='global'?'global':'p09-branch');m.cash.currentSession=mode==='closed'?null:{id:'p09-session',serverConfirmed:true};m.notify('cash');await m.frames();},mode);await openDrawer(width);
          check(await ev(mode=>{const r=document.querySelector('[role="dialog"] .pos-ticket')||document.querySelector('aside[aria-label="Ticket"] .pos-ticket');const b=[...r.querySelectorAll('.pos-ticket-actions button')][0];return b.getBoundingClientRect().bottom<=innerHeight+1&&(mode==='global'?b.disabled&&b.textContent==='Modo lectura':!b.disabled&&b.textContent.includes('Abrir caja'));},mode),'read-only/closed protections '+width+'/'+mode);await shot(`pos-${mode}-${width}`);
          if(width<1024)await key('Escape','Escape',27);
        }
        await ev(async()=>{window.__p09.setBranch('p09-branch');window.__p09.cash.currentSession={id:'p09-session',serverConfirmed:true};window.__p09.notify('cash');await window.__p09.frames();});
        for(const count of [1,3,10]){
          await ev(count=>{const m=window.__p09;m.history.sales=Array.from({length:count},(_,i)=>({...m.makeSale('p1006-'+i,'confirmed'),cashierName:'Ana Pérez'}));},count);await show('operationalHistory');
          check(await ev(()=>document.documentElement.scrollWidth<=innerWidth+1),'history fits '+width+'/'+count);
          const card=await ev(()=>{
            const c=document.querySelector('.sale-history-card'),h=c.querySelector('header'),f=c.querySelector('footer');
            const a=[...f.querySelectorAll('button')].find(b=>b.textContent==='Anular ticket');
            const style=getComputedStyle(c);
            const colorProbe=document.createElement('span');
            colorProbe.hidden=true;
            c.append(colorProbe);
            const resolveColor=value=>{
              colorProbe.style.color=value;
              return getComputedStyle(colorProbe).color;
            };
            const canvas=document.createElement('canvas');
            canvas.width=canvas.height=1;
            const context=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});
            const channels=color=>{
              context.clearRect(0,0,1,1);
              context.fillStyle=color;
              context.fillRect(0,0,1,1);
              return [...context.getImageData(0,0,1,1).data];
            };
            const bg=style.backgroundColor, panel=resolveColor('var(--color-panel)');
            const stripe=style.borderTopColor, success=resolveColor('var(--color-success)');
            const foreground=getComputedStyle(h.querySelector('p')).color;
            const footerForeground=getComputedStyle(f.querySelector('p')).color;
            colorProbe.remove();
            const luminance=color=>color.slice(0,3).map(value=>value/255)
              .map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4)
              .reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
            const rgba=channels(bg), backgroundLight=luminance(rgba);
            const contrast=ink=>{
              const light=luminance(channels(ink));
              return (Math.max(light,backgroundLight)+0.05)/(Math.min(light,backgroundLight)+0.05);
            };
            return {height:c.getBoundingClientRect().height,width:c.clientWidth,action:a.getBoundingClientRect().width,
              head:h.innerText,finance:c.querySelector('dl').innerText,body:c.innerText,label:c.getAttribute('aria-label'),bg,panel,rgba,neutral:rgba.join()===channels(panel).join(),
              backgroundLight,contrast:contrast(foreground),footerContrast:contrast(footerForeground),stripe,success,stripeMatches:channels(stripe).join()===channels(success).join(),
              stripeWidth:style.borderTopWidth,fontFamily:style.fontFamily,headerHeight:h.getBoundingClientRect().height,
              footer:{text:f.innerText,height:f.getBoundingClientRect().height,fontFamily:getComputedStyle(f).fontFamily},
              platform:navigator.platform,userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],actionEnabled:!a.disabled,
              columns:getComputedStyle(document.querySelector('.history-grid')).gridTemplateColumns.split(' ').length,
              excel:document.querySelector('.export-controls').clientHeight,
              exportDescription:document.querySelector('.export-toolbar header p').getBoundingClientRect().height};
          });
          const dimensions=`${width}x${height}, ${count} tickets`;
          historyMetrics.push({dimensions,...card,renderedFonts:count===1?await platformFonts():undefined,
            oldBackgroundCheck:card.bg==='rgb(255, 254, 252)',oldHeightCheck:card.height<310});
          for(const [passed,criterion]of [
            [card.neutral&&card.rgba[3]===255&&card.backgroundLight>=0.85&&card.contrast>=4.5&&card.footerContrast>=4.5,
              `light card matches panel with readable text at ${dimensions}: bg=${card.bg}, panel=${card.panel}, luminance=${card.backgroundLight}, contrast=${card.contrast}, footerContrast=${card.footerContrast}`],
            [card.height<310,`compact card at ${dimensions}: height=${card.height}px, limit <310px, width=${card.width}px, header=${card.headerHeight}px, footer=${card.footer.height}px, font=${card.fontFamily}, footer text=${card.footer.text}`],
            [card.stripeMatches&&parseFloat(card.stripeWidth)>=4,`cash stripe at ${dimensions}: color=${card.stripe}, expected=${card.success}, width=${card.stripeWidth}`],
          ]) {
            if(passed) check(true,criterion); else historyFailures.push(criterion);
          }
          check(card.action<card.width*.65&&card.finance.includes('Total del ticket')&&card.finance.includes('S/ 5.00')&&card.head.includes('04 nov')
            &&card.head.includes('Sede de simulación')&&card.label.endsWith('p1006-0')&&!card.body.includes('p1006-0')&&card.body.includes('Ana Pérez')&&card.actionEnabled,
          `date, branch, amount, accessible ID, responsible and discrete void action ${width}: ${JSON.stringify(card)}`);
          check(card.columns===(width>=1280?3:width>=1024?2:1),'legible columns '+width);
          if(width===1440){check(card.excel<100&&card.exportDescription>0,'Excel keeps a compact desktop action row and a visible description');metrics.push({case:'history-'+count,...card});}
          await shot(`history-${count}-${width}`);
        }
        await ev(()=>{const m=window.__p09;m.history.sales=[m.makeSale('draft','draft_offline'),m.makeSale('uncertain','submitted_uncertain'),{...m.makeSale('voided','confirmed'),voided:true,voidReason:'Motivo conservado'},{...m.makeSale('voidPending','confirmed'),voidCheckPending:true}];});await show('operationalHistory');
        check(await ev(()=>['Sin cobrar','Por comprobar','Venta anulada','Comprobando anulación','Motivo conservado','Revisión local'].every(s=>document.querySelector('.sales-history').textContent.includes(s))),'financial exceptions and secondary rejection history intact');await shot(`history-exceptions-${width}`);
      }
      await size(1280,560);await show('pos');
      const sidebar=await ev(async()=>{const a=document.querySelector('[aria-label="Navegación de escritorio"]'),head=a.querySelector('.sidebar-identity'),foot=a.querySelector('.sidebar-footer'),list=a.querySelector('.sidebar-scroll');const top=head.getBoundingClientRect().top,bottom=foot.getBoundingClientRect().bottom;list.scrollTop=500;await window.__p09.frames();return{start:top,end:head.getBoundingClientRect().top,footBefore:bottom,footAfter:foot.getBoundingClientRect().bottom,scroll:list.scrollTop,headInside:list.contains(head),footInside:list.contains(foot)};});
      check(sidebar.start===sidebar.end&&sidebar.footBefore===sidebar.footAfter&&sidebar.scroll>0&&!sidebar.headInside&&!sidebar.footInside,'only modules scroll; identity and logout remain fixed: '+JSON.stringify(sidebar));metrics.push({case:'sidebar',...sidebar});await shot('sidebar-scroll-1280');
      await ev(()=>{const nav=document.querySelector('.sidebar-scroll');nav.scrollTop=0;[...nav.querySelectorAll('button')].at(-1).focus();});
      check(await ev(()=>{const a=document.querySelector('[aria-label="Navegación de escritorio"]'),r=document.activeElement.getBoundingClientRect(),n=a.querySelector('.sidebar-scroll').getBoundingClientRect();return r.top>=n.top-1&&r.bottom<=n.bottom+1&&a.querySelector('.sidebar-identity').getBoundingClientRect().top===0;}),'keyboard focus scrolls the module list without shifting identity');
      await show('pos');await cart(8);
      for(const height of [560,600,700,900]){
        await size(1280,height);await input(0,'40.00');const m=await focused(0);assertFocus(m,'desktop payment focus at '+height);metrics.push({case:'desktop-focus-'+height,...m});await shot('desktop-focus-'+height);
      }
      for (const height of [560, 600, 700, 800, 900]) {
        await size(1280,height);
        for (const count of [0,1,5,8]) {
          await cart(count);
          for (const method of ['efectivo','yape','mixto']) {
            await selectPayment(method);
            const label=`1280x${height}/${count}/${method}`;
            const bounds=await ev(()=>{
              const ticket=document.querySelector('aside[aria-label="Ticket"] .pos-ticket');
              const total=ticket.querySelector('.pos-ticket-total'), action=ticket.querySelector('.pos-ticket-actions'), items=ticket.querySelector('.pos-ticket-items');
              return {totalTop:total.getBoundingClientRect().top, cta:action.getBoundingClientRect().bottom,
                ticket:ticket.getBoundingClientRect().bottom, items:items.clientHeight, count:items.querySelectorAll('button[aria-label^="Quitar"]').length,
                pageScroll:window.scrollY, ctaHeight:action.querySelector('button').getBoundingClientRect().height};
            });
            check(bounds.count===count&&bounds.totalTop>=0&&bounds.cta<=height&&bounds.ticket<=height&&bounds.items>0
              &&bounds.pageScroll===0&&bounds.ctaHeight>=44,`bounded desktop checkout ${label}: ${JSON.stringify(bounds)}`);
            for (const index of method==='mixto'?[0,1]:method==='efectivo'?[0]:[]) {
              const focus=await focused(index);
              assertFocus(focus,`desktop checkout focus ${label}/${index}`);
              check(focus.field[0]>=0&&focus.field[1]<=height,`focused field entirely inside viewport ${label}/${index}`);
            }
            if (count===8) metrics.push({case:label,...bounds});
          }
        }
      }
      await selectPayment('efectivo');
      await size(390,700);await openDrawer(390);await input(0,'40.00');
      for(const [width,height]of [[390,390],[320,390],[768,360]]){
        await size(width,height);const m=await focused(0);assertFocus(m,`keyboard-sized viewport ${width}/${height}`);metrics.push({case:'focus-'+width,...m});await shot('payment-focus-'+width);
      }
      await size(320,560);await input(0,'0.001');
      check(await ev(()=>{const r=document.querySelector('[role="dialog"] .pos-ticket');return Boolean(r.querySelector('[role="alert"]'))&&r.querySelector('.pos-ticket-actions button').disabled;}),'monetary validation error still visible and charge blocked');await shot('invalid-payment-320');
      await key('Escape', 'Escape', 27);

      const posViewports = [[1280, 560], [1366, 768], [1440, 900], [1024, 448], [768, 1024], [640, 450], [390, 844], [375, 667], [320, 640]];
      for (const [width, height] of posViewports) {
        const label = `${width}x${height}`;
        await size(width, height);
        await cart(8);
        await ev(async () => {
          const { cash, notify, frames } = window.__p09;
          cash.expiresAt = Date.now() + 90 * 60000;
          cash.remainingMinutes = 90;
          notify('cash');
          await frames();
        });
        const toolbar = await ev(() => {
          const header = document.querySelector('.pos-toolbar');
          const button = header.querySelector('button');
          const badge = header.querySelector('[title]');
          return { status: badge.textContent, close: button.textContent,
            colored: getComputedStyle(button).backgroundColor !== getComputedStyle(badge).backgroundColor,
            fits: header.scrollWidth <= header.clientWidth + 1 };
        });
        check(toolbar.status.includes('Caja abierta') && toolbar.status.includes('90 min')
          && toolbar.close === 'Cerrar caja' && toolbar.colored && toolbar.fits, `cash controls ${label}: ${JSON.stringify(toolbar)}`);
        await openDrawer(width);
        await selectPayment('efectivo');
        await input(0, '50.05');
        assertFocus(await focused(0), `cash received focus ${label}`);
        const paymentLayout = await ev(async () => {
          const ticket = document.querySelector('[role="dialog"] .pos-ticket') || document.querySelector('aside[aria-label="Ticket"] .pos-ticket');
          const cash = ticket.querySelector('.pos-cash-payment');
          const received = cash.querySelector('input').getBoundingClientRect();
          const change = cash.querySelector('dd'), changeBounds = change.getBoundingClientRect();
          const items = ticket.querySelector('.pos-ticket-items');
          const payment = ticket.querySelector('.pos-ticket-payment');
          const charge = ticket.querySelector('.pos-ticket-actions button');
          const chargeTop = charge.getBoundingClientRect().top;
          const overflow = items.scrollHeight - items.clientHeight;
          items.scrollTop = items.scrollHeight;
          await window.__p09.frames();
          return { change: change.textContent, sideBySide: received.right < changeBounds.left && Math.abs(received.top - changeBounds.top) <= 1,
            overflow, itemScroll: items.scrollTop, paymentOverflow: payment.scrollHeight - payment.clientHeight,
            chargeFixed: chargeTop === charge.getBoundingClientRect().top && charge.getBoundingClientRect().bottom <= innerHeight,
            chargeEnabled: !charge.disabled, horizontalOverflow: ticket.scrollWidth > ticket.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
        });
        check(paymentLayout.change === 'S/ 10.05' && paymentLayout.sideBySide && !paymentLayout.horizontalOverflow,
          `cash received and exact change ${label}: ${JSON.stringify(paymentLayout)}`);
        check(paymentLayout.chargeFixed && paymentLayout.chargeEnabled && paymentLayout.paymentOverflow <= 1
          && (paymentLayout.overflow <= 1 || paymentLayout.itemScroll > 0), `independent items and visible checkout ${label}: ${JSON.stringify(paymentLayout)}`);
        await key('Tab', 'Tab', 9);
        check(await ev(() => document.activeElement.matches('.pos-ticket-actions button')), `Tab advances from cash received to Cobrar ${label}`);
        await ev(() => {
          const ticket = document.querySelector('[role="dialog"] .pos-ticket') || document.querySelector('aside[aria-label="Ticket"] .pos-ticket');
          ticket.querySelector('.pos-ticket-items').scrollTop = 0;
          document.activeElement.blur();
        });
        await shot(`pos-caja-carrito-${label}`);
        await input(0, '39.99');
        check(await ev(() => {
          const ticket = document.querySelector('[role="dialog"] .pos-ticket') || document.querySelector('aside[aria-label="Ticket"] .pos-ticket');
          return ticket.querySelector('.pos-cash-payment dd').textContent.includes('Por calcular')
            && ticket.querySelector('.pos-ticket-actions button').disabled;
        }), `insufficient cash shows no calculated change and disables Cobrar ${label}`);
        if (width < 1024) await key('Escape', 'Escape', 27);
      }
      await cart(0);
      await ev(async () => {
        document.querySelector('.pos-catalog button[title^="ProductoDeNombreExtenso"]').click();
        await window.__p09.frames();
      });
      await openDrawer(320);
      await selectPayment('efectivo');
      await input(0, '50000.00');
      assertFocus(await focused(0), 'large cash amount stays focused at 320x640');
      check(await ev(() => {
        const ticket = document.querySelector('[role="dialog"] .pos-ticket');
        const items = ticket.querySelector('.pos-ticket-items');
        return items.scrollWidth <= items.clientWidth + 1 && items.textContent.includes('ProductoDeNombreExtenso')
          && ticket.querySelector('.pos-ticket-total strong').textContent === 'S/ 49995.00'
          && ticket.querySelector('.pos-cash-payment dd').textContent === 'S/ 5.00'
          && !ticket.querySelector('.pos-ticket-actions button').disabled;
      }), 'long product name and high payment amount do not overflow or alter exact values');
      await shot('pos-nombre-largo-320x640');
      await ev(()=>window.__p09.stop());
    }});
  } finally {
    await mkdir(artifacts,{recursive:true});
    await writeFile(artifacts+'/history-card-diagnostics.json',JSON.stringify(historyMetrics,null,2));
  }
  assert.deepEqual(historyFailures,[],'History card criteria failed independently');
  await writeFile(artifacts+'/after-layout.json',JSON.stringify(metrics,null,2));
  console.log(JSON.stringify({checks:checks.length,captures:captures.length}));
});

