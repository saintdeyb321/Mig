import React, { useState } from 'react';
import { useAcceptTerms } from '../features/users/hooks/useAcceptTerms';

export default function TermsModal({ user, onAccepted }) {
  const [isChecked, setIsChecked] = useState(false);
  const { isAccepting, handleAccept } = useAcceptTerms(user, onAccepted);

  return (
    <div className="terms-overlay fade-in">
      <div className="terms-container card">

        <div className="terms-header">
          <h2>Términos y Condiciones de MigaPOS</h2>
          <p>Última actualización: Abril 2026 | Versión 1.1</p>
        </div>

        <div className="terms-content">
          <p>Bienvenido a MigaPOS. Para utilizar nuestro sistema, debes leer y aceptar las siguientes condiciones de servicio:</p>

          <h3>1. Naturaleza y Alcance del Servicio</h3>
          <p>
            MigaPOS es una plataforma de software como servicio (SaaS) proporcionada "tal cual", diseñada exclusivamente para el <strong>control interno, gestión de inventario y registro de ventas operativas</strong>.
            Los comprobantes generados son de carácter estrictamente administrativo. <strong>MigaPOS NO es un sistema de Facturación Electrónica homologado por la SUNAT.</strong> El usuario reconoce que el cumplimiento de sus obligaciones tributarias es de su entera responsabilidad.
          </p>

          <h3>2. Disponibilidad del Sistema y Terceros</h3>
          <p>
            MigaPOS opera utilizando infraestructura en la nube. <strong>No nos hacemos responsables por interrupciones del servicio o pérdida de acceso</strong> causadas por fallas en proveedores de terceros (como Google Cloud/Firebase), caídas generales de internet, o problemas con el proveedor local del usuario.
          </p>

          <h3>3. Modo Fuera de Línea (Offline)</h3>
          <p>
            El sistema permite operar temporalmente sin conexión guardando datos en el dispositivo. <strong>Es responsabilidad exclusiva del usuario no borrar la caché, datos de navegación, ni desinstalar la aplicación</strong> hasta que el sistema sincronice con la nube. MigaPOS no se responsabiliza por la pérdida de datos locales no sincronizados.
          </p>

          <h3>4. Responsabilidad de Caja y Empleados</h3>
          <p>
            <strong>MigaPOS se deslinda de toda responsabilidad legal o civil por pérdidas económicas, descuadres de caja, robos sistemáticos o negligencias</strong> cometidas por los empleados o administradores. La correcta delegación de roles en la plataforma y la supervisión del personal son responsabilidad absoluta del titular de la cuenta.
          </p>

          <h3>5. Propiedad de Datos, Privacidad y Derechos ARCO</h3>
          <p>
            La información registrada es propiedad exclusiva del usuario. El tratamiento de datos se rige por nuestra Política de Privacidad, detallando el ejercicio de los derechos ARCO conforme a la ley peruana. Al autenticarse mediante Google, <strong>no seremos responsables por filtraciones derivadas del acceso no autorizado a su cuenta de Google</strong>, pérdida de su dispositivo o equipos infectados por malware.
          </p>

          <h3>6. Suscripciones y Bloqueo de Servicio</h3>
          <p>
            El acceso a MigaPOS está condicionado al pago puntual de la suscripción. En caso de mora, <strong>el sistema bloqueará por completo el acceso a la interfaz y sus datos</strong> hasta la regularización del pago. Si la morosidad supera los 60 días calendario, MigaPOS se reserva el derecho de eliminar permanentemente la cuenta y sus datos asociados para liberar espacio, sin lugar a reclamo.
          </p>

          <h3>7. Límite de Responsabilidad Máxima</h3>
          <p>
            En la medida máxima permitida por la ley, la responsabilidad total y acumulada de MigaPOS frente al usuario por cualquier reclamo o daño, <strong>no superará el monto total pagado por el usuario por concepto de suscripción durante los últimos doce (12) meses</strong> anteriores al evento originario.
          </p>

          <h3>8. Modificaciones a los Términos</h3>
          <p>
            MigaPOS se reserva el derecho de modificar estos términos. Notificaremos sobre cambios con anticipación mediante la plataforma. El uso continuado del sistema constituye la aceptación de los nuevos términos.
          </p>

          <h3>9. Jurisdicción</h3>
          <p>
            Estos términos se rigen bajo las leyes del Perú. Cualquier controversia será sometida a la jurisdicción de los jueces y tribunales de la ciudad de Huancayo, Junín.
          </p>
        </div>

        <div className="terms-footer">
          <label className="terms-checkbox-wrapper" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', textAlign: 'left', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              style={{ width: '20px', height: '20px', marginTop: '2px', cursor: 'pointer' }}
            />
            <span>He leído, entiendo y acepto expresamente las condiciones de servicio, la limitación de responsabilidad y el tratamiento de datos.</span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!isChecked || isAccepting}
            className="btn-primary btn-accept-terms"
            style={{ opacity: (!isChecked || isAccepting) ? 0.6 : 1, cursor: (!isChecked || isAccepting) ? 'not-allowed' : 'pointer' }}
          >
            {isAccepting ? 'Procesando...' : 'Aceptar y Continuar'}
          </button>
        </div>

      </div>
    </div>
  );
}
