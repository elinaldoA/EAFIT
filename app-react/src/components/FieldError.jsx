import { fieldErrorId } from '../lib/fieldErrors';

// Mensagem de erro logo abaixo do campo `id` (ligada a ele por aria-describedby, ver invalidProps).
export default function FieldError({ id, message }) {
  if (!message) return null;
  return <span className="profile-field__error" id={fieldErrorId(id)}>{message}</span>;
}
