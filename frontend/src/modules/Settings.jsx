import { Settings2 } from 'lucide-react';
import { PageHeader, cn, Button, Input, FormField, Card, HelpDisclosure } from "../shared/ui";
import CapabilitiesPanel from '../components/CapabilitiesPanel';
// src/modules/Settings.jsx
import React, { useState } from 'react';
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
  return <div className="animate-enter motion-reduce:animate-none mx-auto min-w-0 space-y-5 pb-6 w-full max-w-6xl">

      {/* HEADER SIMÉTRICO NATIVO */}
      <PageHeader title="Configuración global" icon={Settings2} eyebrow="Tu negocio" description="Datos comerciales y preferencias del sistema." />

      {/* =========================================
          🚀 1. GESTIÓN DE SEDES
       ========================================= */}
      <Card className="space-y-5" tone="accent">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-line pb-4">
          <div>
            <h3 className="m-0 text-base font-bold text-brand-deep">🏢 Sucursales</h3>
            <p className="m-0 text-sm text-muted">Administra tus locales físicos y sus métodos de pago.</p>
          </div>

          <Button type="button" onClick={() => setShowBranches(!showBranches)} variant="secondary" className={cn("flex items-center gap-2 py-1.5 px-3.5 rounded-xl border border-line cursor-pointer text-sm font-semibold text-ink transition-colors motion-reduce:transition-none", showBranches ? "bg-subtle" : "bg-panel", showBranches ? "shadow-none" : "shadow-card")}>
            <span>{showBranches ? 'Ocultar Sucursales' : 'Mostrar Sucursales'}</span>
            <span className={cn("inline-block text-sm transition-colors motion-reduce:transition-none", showBranches ? "rotate-180" : "rotate-0")}>
              ▼
            </span>
          </Button>
        </div>

        {showBranches && <Card className="animate-enter motion-reduce:animate-none" as="div">
            <BranchManager user={user} isEmbedded={true} />
          </Card>}
      </Card>

      {/* =========================================
          🚀 2. DATOS FISCALES
       ========================================= */}
      <Card className="space-y-5" tone="accent">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-line pb-4">
          <div>
            <h3 className="m-0 text-base font-bold text-brand-deep">🧾 Datos para Boletas / Facturas</h3>
            <p className="m-0 text-sm text-muted">Información para los tickets y facturas.</p>
          </div>
          {hasCompanyData && !isEditingCompany && <Button onClick={() => setIsEditingCompany(true)} type="button" variant="secondary" className="py-1.5 px-3 rounded-lg border border-line bg-warning-soft cursor-pointer text-sm font-semibold">
              ✏️ Editar
            </Button>}
        </div>

        {!hasCompanyData || isEditingCompany ? <Card className="animate-enter motion-reduce:animate-none" as="div">
            <div className="grid gap-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>RAZÓN SOCIAL</>}>

                  <Input type="text" name="razonSocial" value={companyData.razonSocial} onChange={handleCompanyDataChange} placeholder="Mi Empresa S.A.C." />
                </FormField>
                <FormField label={<>RUC</>}>

                  <Input type="text" name="ruc" value={companyData.ruc} onChange={handleCompanyDataChange} placeholder="Ej. 20123456789" />
                </FormField>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>DIRECCIÓN FISCAL</>}>

                  <Input type="text" name="direccion" value={companyData.direccion} onChange={handleCompanyDataChange} placeholder="Av. Principal 123" />
                </FormField>
                <FormField label={<>TELÉFONO GENERAL</>}>

                  <Input type="text" name="telefono" value={companyData.telefono} onChange={handleCompanyDataChange} placeholder="987 654 321" />
                </FormField>
              </div>

              <div className="flex justify-end gap-2.5 mt-4">
                {hasCompanyData && <Button type="button" onClick={() => setIsEditingCompany(false)} disabled={isSavingData} variant="secondary">
                    Cancelar
                  </Button>}
                <Button className="py-2 px-5" onClick={handleSaveCompany} disabled={isSavingData} type="button" variant="primary">
                  {isSavingData ? 'Guardando...' : 'Guardar Datos'}
                </Button>
              </div>
            </div>
          </Card> : <Card className="animate-enter motion-reduce:animate-none border-l-4 border-l-primary p-5" as="div">
            <div className="grid gap-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="grid min-w-0 gap-1.5 mb-0">
                  <label className="text-sm font-medium text-muted">RAZÓN SOCIAL</label>
                  <div className="text-lg font-bold text-ink">{companyData.razonSocial || '-'}</div>
                </div>
                <div className="grid min-w-0 gap-1.5 mb-0">
                  <label className="text-sm font-medium text-muted">RUC</label>
                  <div className="text-base text-ink">{companyData.ruc || '-'}</div>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 mt-4">
                <div className="grid min-w-0 gap-1.5 mb-0">
                  <label className="text-sm font-medium text-muted">DIRECCIÓN FISCAL</label>
                  <div className="text-base text-ink">{companyData.direccion || '-'}</div>
                </div>
                <div className="grid min-w-0 gap-1.5 mb-0">
                  <label className="text-sm font-medium text-muted">TELÉFONO GENERAL</label>
                  <div className="text-base text-ink">{companyData.telefono || '-'}</div>
                </div>
              </div>
            </div>
          </Card>}
      </Card>

      <HelpDisclosure title="Disponibilidad de funciones del sistema"><CapabilitiesPanel /></HelpDisclosure>
    </div>;
}
export default Settings;
