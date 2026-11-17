/**
 * Reglas de captura compartidas. Los límites coinciden con el backend
 * (app/models/_validators.py) para que el usuario vea el problema al escribir y
 * no un error crudo del servidor.
 */

/** Deja solo dígitos, espacios y + - ( ) . y corta en 20 caracteres. */
export function sanitizePhone(value: string): string {
  return value.replace(/[^0-9+()\-. ]/g, '').slice(0, 20);
}

/** Props para cualquier <input> de teléfono. */
export const PHONE_INPUT_PROPS = {
  type: 'tel',
  inputMode: 'tel',
  autoComplete: 'tel',
  maxLength: 20,
  pattern: '^(?=(?:\\D*\\d){7,15}\\D*$)[0-9+()\\-. ]{7,20}$',
  title: 'Entre 7 y 15 dígitos. Puedes usar espacios y los signos + - ( )',
  placeholder: '+52 55 1234 5678',
} as const;

const FIELD_LABELS: Record<string, string> = {
  email: 'Correo',
  full_name: 'Nombre',
  telefono: 'Teléfono',
  telefono_contacto: 'Teléfono de contacto',
  email_contacto: 'Correo de contacto',
  nombre: 'Nombre',
  supervisor_nombre: 'Nombre del supervisor',
  supervisor_email: 'Correo del supervisor',
  rfc: 'RFC',
  dominio_corporativo: 'Dominio',
  titulo: 'Título',
  titulo_solicitud: 'Título',
  descripcion: 'Descripción',
  password: 'Contraseña',
  new_password: 'Contraseña',
  precio: 'Precio',
};

interface PydanticError {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
  ctx?: { max_length?: number; min_length?: number };
}

/** Convierte el `detail` de FastAPI (texto o lista de errores 422) en un mensaje legible. */
export function formatApiDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (!Array.isArray(detail)) return 'No se pudo completar la operación.';
  const msgs = (detail as PydanticError[]).map((e) => {
    const campo = String(e.loc?.[e.loc.length - 1] ?? '');
    const label = FIELD_LABELS[campo] ?? campo;
    let msg: string;
    switch (e.type) {
      case 'string_too_long':
        msg = `máximo ${e.ctx?.max_length} caracteres`;
        break;
      case 'string_too_short':
        msg = `mínimo ${e.ctx?.min_length} caracteres`;
        break;
      case 'missing':
        msg = 'es obligatorio';
        break;
      case 'value_error':
        msg = (e.msg ?? '').replace(/^Value error, /, '');
        if (/email address/i.test(msg)) msg = 'no es un correo válido';
        break;
      default:
        msg = e.msg ?? 'valor no válido';
    }
    return label ? `${label}: ${msg}` : msg;
  });
  return Array.from(new Set(msgs)).join(' · ');
}
