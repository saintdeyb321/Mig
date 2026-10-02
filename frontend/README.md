# MigaPOS — frontend

Las dependencias runtime y su lockfile pertenecen a `frontend/`. La raíz contiene únicamente tooling y un lockfile para probar Firebase Rules con Emulator; no se usan workspaces ni dependencias React en raíz. Usa Node 20.19+ o 22.12+, compatible con Vite 7. El contexto permanente del proyecto es `docs/MASTER-PLAN.md`.

## Desarrollo local

Desde la raíz del repositorio:

```powershell
npm ci --prefix frontend
if (!(Test-Path frontend/.env.local)) {
  Copy-Item frontend/.env.example frontend/.env.local
}
```

Completa `frontend/.env.local` con la configuración de la aplicación web obtenida de Firebase Console. Las seis primeras variables son obligatorias; `VITE_FIREBASE_MEASUREMENT_ID` es opcional. Reinicia Vite después de cambiar el entorno.

`VITE_*` se incluye en el bundle del navegador: contiene configuración pública, nunca credenciales Admin SDK, service accounts, claves privadas o tokens del backend. Los archivos locales `.env*` están ignorados; `.env.example` se versiona sin valores reales.

La lectura y validación están centralizadas en `src/config/firebase.js`. `src/firebase.js` conserva los imports existentes. La caché persistente de Firestore mantiene su configuración; Analytics se inicializa de forma opcional y asíncrona cuando el navegador lo soporta.

```powershell
npm run dev --prefix frontend
```

## Validación

```powershell
npm ci --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
git diff --check
```

El build compila el bundle; la configuración Firebase se valida al iniciar la app. Completa el entorno antes de probarla o publicar. `dist/` y `dev-dist/` son outputs generados y no se versionan; los assets fuente permanecen en `public/`.

## Firebase CLI y Hosting

La única configuración oficial reside en la raíz: `.firebaserc`, `firebase.json`, `firestore.rules` y `firestore.indexes.json`. Las reglas e índices oficiales no se modificaron en Fase 1.

Firebase CLI confirmó el proyecto `migapos` y el sitio `migapos-peru`, asociado a la aplicación web de MigaPOS. El target `app` apunta a ese sitio y Hosting sirve `frontend/dist` con el rewrite SPA existente.

Consultas de solo lectura desde la raíz:

```powershell
npx --yes firebase-tools projects:list --json
npx --yes firebase-tools hosting:sites:list --project migapos --json
```

Fase 1 no ejecuta deploy ni modifica datos de Firebase.
