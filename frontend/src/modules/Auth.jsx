// src/modules/Auth.jsx
import React, { useState, useCallback, memo } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase'; 
import toast from 'react-hot-toast';
import InstallButton from '../components/InstallButton'; // 🚀 IMPORTAMOS NUESTRO BOTÓN INTELIGENTE

const Auth = memo(({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogle = useCallback(async () => {
    setIsLoading(true);
    const loadId = toast.loading('Verificando credenciales con Google...');
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      toast.dismiss(loadId); 
      if (onLogin) onLogin(result.user);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error("Error de autenticación:", err);
        toast.error('Error al conectar con Google.', { id: loadId });
      } else {
        toast.dismiss(loadId);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onLogin]); 

  return (
    <div className="auth-container">
      <div className="card fade-in auth-card">
        
        {/* 1. SECCIÓN SUPERIOR: Identidad */}
        <div className="auth-header">
          <div>
            <img 
              src="/img/Logo_MP.png" 
              alt="Logo MigaPOS" 
              className="auth-logo"
            />
          </div>

          <div>
            <h1 className="auth-title">
              K'prichitos<span className="auth-title-highlight">Angie</span>
            </h1>
            <p className="auth-subtitle">
              Sistema de gestión y punto de venta.
            </p>
          </div>
        </div>

        {/* 2. SECCIÓN CENTRAL: Acción Directa */}
        <div className="auth-body">
          <div className="auth-notice">
            Acceso exclusivo solo para personal autorizado.
          </div>

          {/* 🚀 ENVOLVEMOS LOS DOS BOTONES PARA PEGARLOS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
            
            <button 
              type="button" 
              onClick={handleGoogle} 
              disabled={isLoading} 
              className="btn-primary auth-google-btn"
              style={{ margin: 0 }} /* Le quitamos cualquier margen extra aquí */
            >
              <div className="auth-google-icon-wrapper">
                <img 
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                  alt="G" 
                  className="auth-google-icon"
                />
              </div>
              {isLoading ? 'Cargando...' : 'Ingresar con Google'}
            </button>

            {/* 🚀 El botón PWA ahora está íntimamente ligado al de Google */}
            <InstallButton />
            
          </div>
        </div>

        {/* 3. SECCIÓN INFERIOR: Seguridad y Copyright */}
        <div className="auth-footer">
          <div className="auth-security-text">
            <span className="auth-security-icon">🔒</span> Autenticación segura y encriptada
          </div>
          
          <div className="auth-divider"></div>
          
          <footer className="auth-copyright">
            © 2026 MigaPOS
          </footer>
        </div>

      </div>
    </div>
  );
});

export default Auth;
