/**
 * Zonas horarias IANA que reconoce la base de datos (HU13 - criterio 5).
 *
 * La fuente es la propia base: es la que va a interpretar la zona en cada
 * cálculo de día y semana (`AT TIME ZONE`), así que una zona que ella no
 * reconozca no sirve aunque exista en otro catálogo.
 */
export interface TimezoneCatalog {
  list(): Promise<string[]>;
  exists(timezone: string): Promise<boolean>;
}
