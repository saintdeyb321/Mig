# MigaPOS — runbook de publicación DESPUÉS del fix P15

**No ejecutar despliegues mientras la incidencia siga abierta.** Repo revisado: `migapos`, Hosting site `migapos-peru`, publicación con guardas en `scripts/release.mjs`. El proyecto NO tiene staging configurado. GitHub CI actual de Plan14 NO certifica un futuro fix local.

## 0. Comprobaciones antes de publicar

1. Codex termina P15 con pruebas verdes. Propietario verifica manualmente sesión tras F5 / larga inactividad, reintento, logout cajero, permiso denegado, otro negocio y que no haya escrituras basadas en caché.
2. Propietario realiza commit/push **manualmente**; observa en GitHub que **el mismo SHA** supera Actions y descarga su artefacto `release-verification`, guardando `.release/ci-verification.json` sin cambiarlo.
3. `git status --short` debe estar vacío antes de un release; el script ya exige árbol limpio, SHA y huella de código.
4. Consultar en Console `migapos` el estado realmente publicado de las Rules y el conjunto de índices. **NO** reemplazar reglas publicadas a ciegas. Copiar Rules vigentes a `.release/migapos-current.rules` y archivarlas con el comando de abajo.
5. Tener la configuración `frontend/.env.production` real y válida, y la Firebase CLI instalada previamente. Las variables `VITE_` nunca contienen secretos de servicio.

## 1. Preparación PowerShell (sin desplegar)

```powershell
cd C:\Proyectos\MigaPOS
npx --no-install firebase login
npx --no-install firebase projects:list
npm run release:check -- --env production
npm run check:release
npm run audit:security
npm run release:build -- --env production
npm run release:plan -- --env production
```

`release:build` genera `firebase.production.generated.json` y `.release/production.json`, y archiva la política del SHA. `release:plan` muestra comandos concretos para revisión sin ejecutarlos. El build necesita configuración `frontend/.env.production` y el SHA aprobado.

## 2. Evidencia de Rules publicada y variables de guarda

1. En Firebase Console descarga/copia las Rules **actualmente publicadas**, no las locales, a `.release/migapos-current.rules`.
2. Registra la copia, sustituyendo datos REALES de auditoría:

```powershell
node scripts/release.mjs record-published-rules --env production --file .release/migapos-current.rules --version "VERSION_REAL_CONSOLE" --reviewer "TU_IDENTIFICADOR" --confirm-console "migapos/(default)"
```

3. Lee `.release/published-policy/migapos/<HASH_RULES>/manifest.json` para el hash de Rules realmente publicado, y `.release/policy/migapos/<SHA_COMMIT>/manifest.json` para `indexesHash`.
4. Descarga el artefacto CI del commit exacto a `.release/ci-verification.json`.

```powershell
$env:GCLOUD_PROJECT = "migapos"
$env:MIGAPOS_ALLOW_RELEASE = "migapos/migapos-peru"
$env:MIGAPOS_PREVIOUS_RULES = "HASH_SHA256_COPIA_PUBLICADA"
$env:MIGAPOS_REVIEWED_INDEXES = "migapos/(default)/HASH_SHA256_INDICES_REVISADOS"
node scripts/release.mjs guard --env production --config firebase.production.generated.json
```

El comando guard debe imprimir aprobación. Si falla, DETENER y corregir la evidencia, **nunca** quitar las guardas.

## 3. Publicación controlada (SOLO DESPUÉS de superar lo anterior)

Crear punto de recuperación Hosting usando el SHA real abreviado:

```powershell
npx --no-install firebase hosting:clone migapos-peru:live migapos-peru:rollback-SHA12 --project migapos
```

- Si P15 solo cambió React/JS, publicar **solo Hosting** (después de validar las Rules/indexes actuales):

```powershell
npx --no-install firebase deploy --only hosting --project migapos --config firebase.production.generated.json
```

- Si hay cambios previamente auditados y APROBADOS en Rules/indexes (por ejemplo Plan14 recuperación de caja), preparar/revisar rollback de Rules y desplegar primero la política con autorización explícita. **No ejecutar esta línea por la sola incidencia de sesión**:

```powershell
npx --no-install firebase deploy --only "firestore:rules,firestore:indexes" --project migapos --config firebase.production.generated.json
npx --no-install firebase deploy --only hosting --project migapos --config firebase.production.generated.json
```

El despliegue de Rules sobrescribe las Rules publicadas por consola. `hosting:clone` **NO** revierte Firestore Rules ni índices ni documentos.

## 4. Verificación y simulaciones

- Abrir sitio real; entrar como usuario demo de negocio exclusivo, sin crear tickets de clientes reales.
- Dejar pestaña inactiva/reanudar, F5, reintento y verificar que no se pida borrar IndexedDB. Revisar que el estado offline impida cobros.
- Abrir una caja de ensayo, crear ventas ficticias, descargar Excel/PDF y verificar números; luego cancelar conforme a flujo oficial, sin borrar colecciones de producción.
- Comprobar `licenses`, `tenants`, permisos por sede; verificar disponibilidad de Rules realmente publicadas.
- Si aparece bloqueo: detener ventas y usar recuperación Hosting/Rules con procedimientos separados. No eliminar datos en el proyecto real.

Para una certificación de carga/estrés, preferir emuladores o staging independiente. En producción solo smoke controlado de un tenant de ensayo.
