import { Button, Card } from "../shared/ui";
// src/modules/Auth.jsx
import React, { useState, useCallback, memo } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../core/firebase/client';
import toast from 'react-hot-toast';
import InstallButton from '../components/InstallButton';
import { brand } from '../config/brand';
const Auth = memo(({
  onLogin
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const handleGoogle = useCallback(async () => {
    setIsLoading(true);
    const loadId = toast.loading('Verificando credenciales con Google...');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    try {
      const result = await signInWithPopup(auth, provider);
      toast.dismiss(loadId);
      if (onLogin) onLogin(result.user);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error("Error de autenticación:", err);
        toast.error('Error al conectar con Google.', {
          id: loadId
        });
      } else {
        toast.dismiss(loadId);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onLogin]);
  return <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary-soft via-canvas to-accent-soft px-4 py-10">
      <Card className="animate-enter motion-reduce:animate-none grid w-full max-w-md gap-8 rounded-3xl p-6 text-center shadow-float sm:p-9" as="div">

        {/* 1. SECCIÓN SUPERIOR: Identidad */}
        <div className="grid justify-items-center gap-4">
          <div>
            <img src={brand.logo} alt={`Logo ${brand.name}`} className="h-20 w-auto object-contain" />
          </div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight text-primary">
              {brand.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sistema de gestión y punto de venta.
            </p>
          </div>
        </div>

        {/* 2. SECCIÓN CENTRAL: Acción Directa */}
        <div className="grid gap-4">
          <div className="rounded-xl bg-subtle p-3 text-sm text-muted">
            Acceso exclusivo solo para personal autorizado.
          </div>

          <div className="flex flex-col gap-2.5 mt-2.5">

            <Button type="button" onClick={handleGoogle} disabled={isLoading} className="w-full m-0" variant="primary">
              <div className="rounded-full bg-white p-1">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="size-5" />
              </div>
              {isLoading ? 'Cargando...' : 'Ingresar con Google'}
            </Button>

            <InstallButton />

          </div>
        </div>

        {/* 3. SECCIÓN INFERIOR: Seguridad y Copyright */}
        <div className="grid gap-4">
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            <span className="text-base">🔒</span> Autenticación segura y encriptada
          </div>

          <div className="h-px bg-line"></div>

          <footer className="text-xs text-muted">
            © {new Date().getFullYear()} {brand.name}
          </footer>
        </div>

      </Card>
    </div>;
});
export default Auth;
