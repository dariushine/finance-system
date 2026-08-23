// Validación de variables de entorno al arrancar.
// Sin dependencias extra: valida los campos críticos y lanza error claro.

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(`Variable de entorno requerida: ${name}`);
  }
  return value;
}

// Se ejecuta al arrancar (ConfigModule validation). Devuelve env validada.
export function validateEnv(config: Record<string, unknown>) {
  // En dev (sin credenciales) la auth queda deshabilitada como el backend previo.
  const authUsername = (config.AUTH_USERNAME as string) || "";
  const authPassword = (config.AUTH_PASSWORD as string) || "";

  // Si la auth está habilitada, JWT_SECRET es obligatorio (no usar el default).
  if (authUsername && authPassword) {
    const secret = (config.JWT_SECRET as string) || "";
    if (!secret || secret === "change-me-in-production") {
      throw new Error(
        "JWT_SECRET debe configurarse en producción (AUTH habilitada). " +
          "No usar el valor por defecto.",
      );
    }
  }

  return config;
}
