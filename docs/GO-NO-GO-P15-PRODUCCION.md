# MigaPOS — P15: autorización de despliegue y piloto (10/11/2026)

## Identificación
- Repositorio: `saintdeyb321/Mig`.
- Rama revisada: `fix/migapos-production-readiness`.
- SHA P15 auditado: `1b5bea45c07e8879962a572b1012d5f0abf46e13`.
- CI asociado: https://github.com/saintdeyb321/Mig/actions/runs/42849636584
- Proyecto Firebase producción: `migapos`.
- Sitio Hosting de destino: `migapos-peru`.
- `main` sigue en `6ca437bf2c4c29ffa169e6cc47c87e11c91d0cf2` y NO es el candidato de release.

## Dictamen condicionado
La revisión del repositorio y el reporte local apoyan la corrección de la revalidación de sesión. El CI del SHA exacto debe finalizar con éxito y generar `release-verification`. La identidad del usuario y el acceso a negocio/licencia deben validarse desde servidor, nunca autorizar cobros solo desde caché. Las Rules del Plan 14 para recuperar caja requieren confirmación de su publicación y comprobación con tenant de ensayo antes de entregar el sistema a un negocio.

## Criterios obligatorios (GO/NO-GO)
- [ ] GitHub Actions: todas las etapas verdes y artefacto `release-verification` perteneciente al SHA anterior.
- [ ] El checkout local apunta al mismo SHA, con árbol Git limpio, sin archivos de código sin publicar.
- [ ] Variables de `frontend/.env.production` corresponden a Firebase `migapos`, sin secretos privados expuestos por variables `VITE_`.
- [ ] Proyecto Firebase, Hosting site, Rules e índices existentes verificados en Console; copia real de Rules publicada archivada. NO suponer que las Rules del repositorio ya están desplegadas.
- [ ] Comprobar que las Rules del Plan 14 permiten solo la recuperación de caja autorizada con la transacción completa.
- [ ] Validar reversibilidad: respaldo de sitio Hosting con `hosting:clone`; rollback de Rules independiente y previamente documentado.
- [ ] Una cuenta de ensayo (dueño) sobre sitio Hosting recupera acceso tras F5, pérdida de red y reintento sin borrar IndexedDB.
- [ ] Sesión vencida, licencia suspendida/expirada o permisos denegados NO permiten registrar venta.
- [ ] Abrir caja, vender efectivo/Yape/mixto, anular, cerrar, descargar Excel y guardar PDF en tenant de ensayo; Dashboard y exportaciones concilian.
- [ ] Caja vencida de ensayo: nuevo fondo independiente, viejo arqueo no declarado, no dos sesiones activas; con Rules publicadas.
- [ ] Comprobar separación de negocio y sede con dos cuentas de prueba.
- [ ] Restauración de respaldos: procedimiento operativo verificado o riesgo explícito y compensaciones para piloto supervisado.
- [ ] Acordar alcances iniciales: sin migración de tickets antiguos `voided`, sin prometer informe anual ilimitado ni sincronización de ventas offline, y devoluciones monetarias verificadas por procedimiento manual.

## Preparación (no publica)
Ejecutar en PowerShell y desde la rama/commit exactos verificados:

```powershell
cd C:\Proyectos\MigaPOS

git branch --show-current
git rev-parse HEAD
git status --short

npx --no-install firebase login
npx --no-install firebase projects:list

npm run release:check -- --env production
npm run check:release
npm run audit:security
npm run release:build -- --env production
npm run release:plan -- --env production
```

El script exige `frontend/.env.production` válido, un checkout limpio y datos exactos de la compilación. NO desplegar si el SHA es diferente al certificado.

## Evidencia y guardas
1. Descargar manualmente `release-verification` del workflow CI del mismo SHA, extraer el archivo `ci-verification.json` como `.release/ci-verification.json` SIN editar.
2. Copiar las **Rules actualmente publicadas en Firebase Console** a `.release/migapos-current.rules` (no el archivo local sin comprobar).
3. Registrar y conservar la evidencia:

```powershell
node scripts/release.mjs record-published-rules --env production --file .release/migapos-current.rules --version "VERSION_REAL_CONSOLE" --reviewer "REVISOR_REAL" --confirm-console "migapos/(default)"
```

4. Leer los archivos generados de política e índice para conocer hashes reales. No copiar los marcadores de ejemplo literalmente:
   - `.release/published-policy/migapos/<HASH_RULES>/manifest.json`.
   - `.release/policy/migapos/<SHA_COMPLETO>/manifest.json`.

```powershell
$env:GCLOUD_PROJECT = "migapos"
$env:MIGAPOS_ALLOW_RELEASE = "migapos/migapos-peru"
$env:MIGAPOS_PREVIOUS_RULES = "HASH_SHA256_COPIA_PUBLICADA"
$env:MIGAPOS_REVIEWED_INDEXES = "migapos/(default)/HASH_SHA256_INDICES_REVISADOS"
node scripts/release.mjs guard --env production --config firebase.production.generated.json
```

Detenerse inmediatamente si la guarda no aprueba.

## Publicación (acción manual e irreversible para sitio público)
Tras aprobación GO y conservación de evidencia:

```powershell
npx --no-install firebase hosting:clone migapos-peru:live migapos-peru:rollback-1b5bea45c07e --project migapos
```

**Opción Hosting solamente** — si las Rules realmente publicadas están ya revisadas y son compatibles:

```powershell
npx --no-install firebase deploy --only hosting --project migapos --config firebase.production.generated.json
```

**Opción Rules/índices + Hosting** — únicamente si hace falta publicar la recuperación de caja de Plan 14 y se ha aprobado esa política y su conjunto de índices:

```powershell
npx --no-install firebase deploy --only "firestore:rules,firestore:indexes" --project migapos --config firebase.production.generated.json
npx --no-install firebase deploy --only hosting --project migapos --config firebase.production.generated.json
```

No usar `firebase deploy` sin configuración generada ni `firebase deploy --only functions`. El release del proyecto se limita a Hosting y Firestore. El clon de Hosting NO revierte Rules, índices ni datos. Una publicación de Rules sustituye las existentes.

## Verificación posterior a la publicación
- Examinar dirección real configurada en Firebase Console, no asumir el sitio solo por el nombre.
- Probar únicamente con negocio y cuentas de ensayo. No usar datos o dinero real de clientes para hacer pruebas destructivas.
- Comprobar sesión, cobro, caja recuperada, pedidos, exportaciones, aislamiento y métricas de lectura; capturar tiempos/errores sin datos personales.
- Si cualquier prueba crítica falla, bloquear operación real y aplicar el procedimiento de recuperación apropiado (Hosting y Rules por separado).

## Riesgos explícitos no cerrados
- El incidente original de sesión del propietario todavía no se reprodujo de forma causal sobre su navegador real.
- Anulación de ticket histórico legado `voided` entre períodos: resultado financiero provisional cuando falta recibo fuera del rango.
- Exportación anual sobre 10.000 tickets de un negocio se detiene por seguridad; informes mensuales fríos a escala pueden superar las cuotas gratuitas de Firestore.
- Devoluciones contables no certifican desembolsos; inventario perecedero y arqueo requieren control operativo.
- No se ha demostrado la restauración real de respaldos en un entorno separado.

**Decisión:** puede comercializarse mediante demostraciones y pilotos supervisados con alcance acotado. No declarar venta masiva ni recuperación automática sin verificar lo anterior.
