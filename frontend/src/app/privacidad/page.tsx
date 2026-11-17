import type { Metadata } from 'next';
import LegalPage, { LEGAL } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Aviso de privacidad · NextGen Course',
};

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Aviso de privacidad"
      sibling={{ href: '/terminos', label: 'Términos y condiciones' }}
      intro={
        <p>
          {LEGAL.responsable}{' '}(en adelante, &ldquo;NextGen&rdquo;) es responsable del tratamiento de los datos
          personales que nos proporcionas al usar {LEGAL.plataforma} ({LEGAL.sitio}). Este aviso explica qué datos
          usamos, para qué y cómo puedes ejercer tus derechos, conforme a la legislación mexicana aplicable en
          materia de protección de datos personales en posesión de particulares.
        </p>
      }
    >
      <h2>1. Datos que tratamos</h2>
      <ul>
        <li><b>Identificación y contacto:</b> nombre completo, correo electrónico y, si lo proporcionas, teléfono.</li>
        <li><b>Cuenta:</b> rol en la plataforma y, en su caso, la organización (empresa) que te dio de alta o te invitó.</li>
        <li><b>Actividad académica:</b> cursos en los que te inscribes, avance por lección, resultados de evaluaciones, certificados emitidos y reseñas que publiques.</li>
        <li><b>Datos técnicos:</b> dirección IP, tipo de navegador y registros de acceso necesarios para la seguridad del servicio.</li>
        <li><b>Pagos:</b> cuando compras un curso, el cobro lo procesa un proveedor de pagos externo; NextGen no recibe ni almacena los datos de tu tarjeta, solo la confirmación de la operación.</li>
      </ul>
      <p>No solicitamos datos personales sensibles.</p>

      <h2>2. Finalidades</h2>
      <p>Usamos tus datos para las siguientes finalidades, necesarias para darte el servicio:</p>
      <ul>
        <li>Crear, activar y administrar tu cuenta, y permitirte iniciar sesión.</li>
        <li>Darte acceso a los cursos, registrar tu avance y emitir tus certificados con tu nombre.</li>
        <li>Si tu cuenta pertenece a una organización, compartir con su supervisor tu avance y tus inscripciones en los cursos que esa organización te asignó.</li>
        <li>Enviarte correos operativos: activación de cuenta, invitaciones a cursos y recuperación de contraseña.</li>
        <li>Proteger la plataforma, prevenir usos indebidos y atender fallas.</li>
      </ul>
      <p>
        De forma adicional, usamos información agregada y no identificable para mejorar los cursos y la plataforma.
        Si no deseas que tus datos se usen para esta finalidad, escríbenos a{' '}
        <a href={`mailto:${LEGAL.contacto}`}>{LEGAL.contacto}</a>; esto no afectará tu acceso al servicio.
      </p>

      <h2>3. Con quién compartimos tus datos</h2>
      <ul>
        <li><b>Tu organización</b>, cuando tu cuenta fue creada o asignada por ella, únicamente respecto de los cursos que te asignó.</li>
        <li><b>Proveedores que nos prestan servicios</b> (alojamiento de la plataforma, transmisión de video, envío de correos, procesamiento de pagos y monitoreo de errores), que tratan los datos por cuenta de NextGen y solo para prestar ese servicio.</li>
        <li><b>Autoridades</b>, cuando una ley o una orden competente lo requiera.</li>
      </ul>
      <p>No vendemos ni rentamos tus datos personales.</p>

      <h2>4. Cookies y almacenamiento en tu navegador</h2>
      <p>
        Usamos cookies estrictamente necesarias para mantener tu sesión iniciada de forma segura, y guardamos en tu
        navegador preferencias como el tema claro u oscuro. No usamos cookies de publicidad. Si bloqueas las cookies,
        no podrás iniciar sesión.
      </p>

      <h2>5. Conservación</h2>
      <p>
        Conservamos tus datos mientras tu cuenta esté activa y, después, durante el tiempo necesario para cumplir
        obligaciones legales o aclarar responsabilidades. Los certificados emitidos se conservan para poder
        verificarlos.
      </p>

      <h2>6. Tus derechos (ARCO) y revocación del consentimiento</h2>
      <p>
        Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su tratamiento, así como revocar tu
        consentimiento o limitar su uso, enviando una solicitud a{' '}
        <a href={`mailto:${LEGAL.contacto}`}>{LEGAL.contacto}</a> con tu nombre, el correo de tu cuenta, el
        derecho que deseas ejercer y, en su caso, los datos a corregir. Te responderemos dentro de los plazos que
        establece la ley. Tu nombre y teléfono también puedes corregirlos directamente desde tu perfil.
      </p>

      <h2>7. Cambios a este aviso</h2>
      <p>
        Cualquier cambio a este aviso se publicará en esta misma página, indicando la fecha de la última
        actualización.
      </p>
    </LegalPage>
  );
}
