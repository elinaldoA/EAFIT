// Regras de senha do app (o que o cadastro, a recuperação e o servidor exigem).
export const MIN_PASSWORD = 8;
// Limite do bcrypt no Supabase Auth: acima disso o servidor recusa a senha.
export const MAX_PASSWORD = 72;
