import { CakeSlice, LockKeyhole, ShoppingBag, Sparkles } from 'lucide-react';
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
  return <div className="flex min-h-dvh items-center justify-center bg-linear-to-br from-brand-deep via-sidebar to-primary px-4 py-8 sm:px-6">
    <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-16">
      <section className="hidden space-y-8 text-white lg:block">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white/85"><Sparkles aria-hidden="true" className="size-4" />Tu negocio, en orden</div>
        <h2 className="max-w-lg text-5xl font-extrabold leading-tight tracking-tight">Más tiempo para<br /><span className="text-violet-300">lo que creas.</span></h2>
        <p className="max-w-md text-base leading-relaxed text-white/75">Ventas, pedidos y equipo en un solo espacio. Empieza tu jornada con todo a mano.</p>
        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"><ShoppingBag aria-hidden="true" className="size-5 text-violet-300" /><span>Punto de venta y control por sede</span></div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"><CakeSlice aria-hidden="true" className="size-5 text-violet-300" /><span>Pedidos, anticipos y entregas</span></div>
        </div>
      </section>
      <Card className="animate-enter grid w-full max-w-md justify-self-center gap-7 rounded-3xl border-white/20 p-6 text-center shadow-float motion-reduce:animate-none sm:p-9" as="div">
        <div className="grid justify-items-center gap-4">
          <span className="flex size-24 items-center justify-center rounded-3xl border border-primary/10 bg-primary-soft shadow-card"><img src={brand.logo} alt={`Logo ${brand.name}`} className="size-18 rounded-2xl object-contain" /></span>
          <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">Bienvenido a</p><h1 className="text-4xl font-extrabold tracking-tight text-brand-deep">{brand.name}</h1><p className="mt-3 text-sm leading-relaxed text-muted">Tu espacio de gestión y punto de venta.</p></div>
        </div>
        <div className="grid gap-4">
          <p className="rounded-xl border border-primary/10 bg-primary-soft/50 p-3 text-xs leading-relaxed text-muted">Ingresa con la cuenta autorizada de tu negocio.</p>
          <Button type="button" onClick={handleGoogle} loading={isLoading} size="lg" className="w-full">
            {!isLoading && <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-white text-base font-bold text-primary">G</span>}{isLoading ? 'Verificando acceso…' : 'Ingresar con Google'}
          </Button>
          <InstallButton />
        </div>
        <div className="space-y-5 border-t border-line pt-5">
          <p className="flex items-center justify-center gap-2 text-xs text-muted"><LockKeyhole aria-hidden="true" className="size-4 text-success" />Acceso seguro con tu cuenta Google</p>
          <footer className="text-xs text-muted">© {new Date().getFullYear()} {brand.name}</footer>
        </div>
      </Card>
    </div>
  </div>;
});
export default Auth;
