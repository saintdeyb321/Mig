import { ChevronDown, Pencil, ReceiptText, Settings2, Store } from 'lucide-react';
import { PageHeader, cn, Button, Input, FormField, Card } from '../shared/ui';
import CapabilitiesPanel from '../components/CapabilitiesPanel';
import { useState } from 'react';
import { useSettings } from '../features/settings/hooks/useSettings';
import BranchManager from './BranchManager';
function Settings({
  user
}) {
  const {
    companyData,
    handleCompanyDataChange,
    saveCompanyData,
    isSavingData
  } = useSettings(user);
  const [showBranches, setShowBranches] = useState(false);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const hasCompanyData = Boolean(companyData?.ruc || companyData?.razonSocial);
  const handleSaveCompany = async () => {
    if (await saveCompanyData()) setIsEditingCompany(false);
  };
  return <div className="workspace-page max-w-6xl animate-enter motion-reduce:animate-none">

      <PageHeader title="Configuración global" icon={Settings2} eyebrow="Tu negocio" description="Datos comerciales y preferencias del sistema." className="to-primary-soft/70" />

      <Card className="space-y-4 border-stellar/20 bg-linear-to-br from-panel to-stellar-soft/65">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-stellar/15 bg-stellar-soft text-stellar"><Store aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-brand-deep">Sucursales</h2>
              <p className="text-sm text-muted">Administra tus locales físicos y sus métodos de pago.</p>
            </div>
          </div>

          <Button type="button" onClick={() => setShowBranches(!showBranches)} aria-expanded={showBranches} aria-controls="settings-branches" variant="secondary" className={cn('border-stellar/30 text-stellar hover:border-stellar hover:bg-stellar-soft', showBranches && 'bg-stellar-soft shadow-none')}>
            <span>{showBranches ? 'Ocultar Sucursales' : 'Mostrar Sucursales'}</span>
            <ChevronDown aria-hidden="true" className={cn('motion-safe:transition-transform', showBranches && 'rotate-180')} />
          </Button>
        </div>

        <div id="settings-branches" hidden={!showBranches}>
          {showBranches && <div className="border-t border-stellar/15 pt-4"><BranchManager user={user} isEmbedded /></div>}
        </div>
      </Card>

      <Card className="space-y-4 border-finance-line bg-linear-to-br from-panel to-success-soft/75">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-finance-line bg-success-soft text-success"><ReceiptText aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-brand-deep">Datos para boletas y facturas</h2>
              <p className="text-sm text-muted">Información comercial para tus comprobantes.</p>
            </div>
          </div>
          {hasCompanyData && !isEditingCompany && <Button onClick={() => setIsEditingCompany(true)} type="button" variant="secondary" className="border-finance-line text-success hover:border-success hover:bg-success-soft">
              <Pencil aria-hidden="true" />Editar
            </Button>}
        </div>

        {!hasCompanyData || isEditingCompany ? <div className="rounded-xl border border-finance-line bg-panel/90 p-3.5 sm:p-4">
            <div className="grid gap-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label="Razón social">

                  <Input type="text" name="razonSocial" value={companyData.razonSocial} onChange={handleCompanyDataChange} placeholder="Mi Empresa S.A.C." />
                </FormField>
                <FormField label="RUC">

                  <Input type="text" name="ruc" value={companyData.ruc} onChange={handleCompanyDataChange} placeholder="Ej. 20123456789" />
                </FormField>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label="Dirección fiscal">

                  <Input type="text" name="direccion" value={companyData.direccion} onChange={handleCompanyDataChange} placeholder="Av. Principal 123" />
                </FormField>
                <FormField label="Teléfono general">

                  <Input type="text" name="telefono" value={companyData.telefono} onChange={handleCompanyDataChange} placeholder="987 654 321" />
                </FormField>
              </div>

              <div className="flex flex-wrap justify-end gap-2.5 border-t border-finance-line/60 pt-3">
                {hasCompanyData && <Button type="button" onClick={() => setIsEditingCompany(false)} disabled={isSavingData} variant="secondary">
                    Cancelar
                  </Button>}
                <Button className="py-2 px-5" onClick={handleSaveCompany} disabled={isSavingData} type="button" variant="primary">
                  {isSavingData ? 'Guardando...' : 'Guardar Datos'}
                </Button>
              </div>
            </div>
          </div> : <dl className="grid min-w-0 gap-2.5 sm:grid-cols-2">
            {[
              ['Razón social', companyData.razonSocial], ['RUC', companyData.ruc],
              ['Dirección fiscal', companyData.direccion], ['Teléfono general', companyData.telefono],
            ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-finance-line/80 bg-panel/90 px-3 py-2.5">
              <dt className="text-xs font-semibold text-success">{label}</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums wrap-anywhere">{value || '—'}</dd>
            </div>)}
          </dl>}
      </Card>

      <CapabilitiesPanel />
    </div>;
}
export default Settings;
