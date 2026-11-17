import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { LEGAL } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Términos y condiciones · NextGen Course',
};

export default function TerminosPage() {
  return (
    <LegalPage
      title="Términos y condiciones de uso"
      sibling={{ href: '/privacidad', label: 'Aviso de privacidad' }}
      intro={
        <p>
          Estos términos regulan el uso de {LEGAL.plataforma} ({LEGAL.sitio}), plataforma de cursos en línea operada
          por {LEGAL.responsable}{' '}(&ldquo;NextGen&rdquo;). Al crear tu cuenta o iniciar sesión aceptas estos términos
          y el <Link href="/privacidad">Aviso de privacidad</Link>.
        </p>
      }
    >
      <h2>1. El servicio</h2>
      <p>
        {LEGAL.plataforma} permite tomar cursos en video, lecturas y evaluaciones, registrar tu avance y obtener un
        certificado al concluir cada curso. Algunos cursos están disponibles para cualquier usuario y otros solo para
        integrantes de una organización que adquirió acceso a ellos.
      </p>

      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Las cuentas se crean por invitación o por alta de tu organización, y se activan con el enlace enviado a tu correo.</li>
        <li>Tu cuenta es personal: no compartas tu contraseña ni permitas que otra persona tome los cursos por ti.</li>
        <li>Tu correo electrónico es el identificador de la cuenta y no puede cambiarse desde el perfil.</li>
        <li>Debes registrar tu nombre real: es el que aparecerá en tus certificados.</li>
      </ul>

      <h2>3. Uso permitido</h2>
      <p>Al usar la plataforma te comprometes a no:</p>
      <ul>
        <li>Descargar, grabar, copiar o redistribuir los videos y materiales fuera de los recursos que la plataforma ofrece para descarga.</li>
        <li>Intentar acceder a cursos, cuentas o información que no te corresponden, o afectar el funcionamiento del servicio.</li>
        <li>Publicar reseñas falsas, ofensivas o con datos de terceros.</li>
      </ul>

      <h2>4. Propiedad intelectual</h2>
      <p>
        Los cursos, videos, textos, evaluaciones, marcas y diseño de la plataforma pertenecen a NextGen o a sus
        respectivos titulares. Te otorgamos una licencia personal, limitada, no exclusiva e intransferible para
        consultarlos dentro de la plataforma mientras tengas acceso a ellos.
      </p>

      <h2>5. Acceso por organización</h2>
      <p>
        Si accedes a cursos por medio de tu organización, el acceso depende de que tu organización mantenga vigente
        su licencia y de que sigas perteneciendo a ella. Si tu organización te da de baja o su licencia termina,
        podrás perder el acceso a esos cursos. Tu organización puede consultar tu avance en los cursos que te asignó.
      </p>

      <h2>6. Evaluaciones y certificados</h2>
      <p>
        Los certificados acreditan que concluiste un curso dentro de la plataforma. No constituyen un título ni un
        documento con reconocimiento de validez oficial de estudios. Las evaluaciones pueden tener un número limitado
        de intentos.
      </p>

      <h2>7. Compras</h2>
      <p>
        Los cursos de paga muestran su precio antes de comprarlos. El cobro se realiza por medio de un proveedor de
        pagos externo, sujeto también a sus propios términos. Para aclaraciones sobre un pago, escríbenos a{' '}
        <a href={`mailto:${LEGAL.contacto}`}>{LEGAL.contacto}</a>.
      </p>

      <h2>8. Disponibilidad y cambios del servicio</h2>
      <p>
        Procuramos que la plataforma esté disponible de forma continua, pero puede haber interrupciones por
        mantenimiento o causas ajenas a nosotros. Podemos actualizar, reorganizar o retirar contenidos y funciones.
      </p>

      <h2>9. Suspensión</h2>
      <p>
        Podemos suspender o cancelar una cuenta que incumpla estos términos o que ponga en riesgo la seguridad de la
        plataforma o de otros usuarios.
      </p>

      <h2>10. Responsabilidad</h2>
      <p>
        Los cursos tienen fines formativos. En la medida que lo permita la ley, NextGen no será responsable por daños
        indirectos derivados del uso o de la imposibilidad de usar la plataforma.
      </p>

      <h2>11. Cambios a estos términos</h2>
      <p>
        Podemos modificar estos términos; la versión vigente siempre estará publicada en esta página con su fecha de
        actualización. Si sigues usando la plataforma después de un cambio, se entiende que lo aceptas.
      </p>

      <h2>12. Legislación aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia se someterá a
        los tribunales competentes en México.
      </p>
    </LegalPage>
  );
}
