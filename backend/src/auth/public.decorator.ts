import { SetMetadata } from "@nestjs/common";

// Marca una ruta como pública (se salta el guard global de auth).
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
