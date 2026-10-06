-- AlterTable
ALTER TABLE "pregunta" ADD COLUMN     "codigo" VARCHAR(50) NOT NULL,
ADD COLUMN     "id_regla_elegibilidad" UUID,
ADD COLUMN     "puede_cambiar" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "pregunta_codigo_key" ON "pregunta"("codigo");

-- AddForeignKey
ALTER TABLE "pregunta" ADD CONSTRAINT "pregunta_id_regla_elegibilidad_fkey" FOREIGN KEY ("id_regla_elegibilidad") REFERENCES "regla_elegibilidad"("id_regla_elegibilidad") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Agregado a mano: datos iniciales de aptitud (TAREA-3) ───────────────────
-- Sin estas filas no hay cuestionario ni regla de 56 días. Los ids se generan en la base
-- (en el resto del sistema los genera Prisma).

-- Reglas. dias_diferimiento NULL = sin fecha de reingreso.
-- El único plazo fijado por el issue es el de 56 días. Los demás son PROVISORIOS: hay que
-- confirmarlos con la normativa y corregirlos con una migración nueva (UPDATE), sin tocar código.
INSERT INTO "regla_elegibilidad" ("id_regla_elegibilidad", "codigo", "tipo", "sexo_aplica", "dias_diferimiento", "vigente_desde", "fuente_normativa") VALUES
  (gen_random_uuid(), 'INTERVALO_SANGRE_ENTERA', 'intervalo_donacion', 'todos',    56,   '2026-01-01', 'Normativa vigente: 56 días entre donaciones de sangre entera (funcionalidad 3)'),
  (gen_random_uuid(), 'TATUAJE',                 'diferimiento',       'todos',    180,  '2026-01-01', 'PROVISORIO: confirmar el plazo con la normativa del Ministerio de Salud'),
  (gen_random_uuid(), 'CIRUGIA',                 'diferimiento',       'todos',    180,  '2026-01-01', 'PROVISORIO: confirmar el plazo con la normativa del Ministerio de Salud'),
  (gen_random_uuid(), 'VIAJE',                   'diferimiento',       'todos',    365,  '2026-01-01', 'PROVISORIO: confirmar el plazo con la normativa del Ministerio de Salud'),
  (gen_random_uuid(), 'EMBARAZO',                'diferimiento',       'femenino', 180,  '2026-01-01', 'PROVISORIO: confirmar el plazo con la normativa del Ministerio de Salud'),
  (gen_random_uuid(), 'MEDICACION',              'diferimiento',       'todos',    7,    '2026-01-01', 'PROVISORIO: confirmar el plazo con la normativa del Ministerio de Salud'),
  (gen_random_uuid(), 'ENFERMEDAD_TRANSMISIBLE', 'diferimiento',       'todos',    NULL, '2026-01-01', 'PROVISORIO: confirmar con la normativa del Ministerio de Salud');

-- Preguntas del formulario versión 1. Cada una apunta a la regla con su mismo código.
--   tipo fecha : se responde con la fecha del hecho (YYYY-MM-DD) o "no"
--   tipo si_no : se responde "si" o "no"
--   puede_cambiar = false : se responde una sola vez y no se vuelve a preguntar
INSERT INTO "pregunta" ("id_pregunta", "codigo", "texto", "tipo", "version_formulario", "puede_cambiar", "id_regla_elegibilidad")
SELECT gen_random_uuid(), p.codigo, p.texto, p.tipo::"tipo_pregunta", 1, p.puede_cambiar, r."id_regla_elegibilidad"
FROM (VALUES
  ('TATUAJE',                 '¿Te hiciste un tatuaje, un piercing o una perforación? Si fue así, indicá la fecha del último.', 'fecha', true),
  ('CIRUGIA',                 '¿Tuviste una cirugía? Si fue así, indicá la fecha de la última.',                               'fecha', true),
  ('VIAJE',                   '¿Viajaste a una zona con paludismo (malaria)? Si fue así, indicá la fecha en que volviste.',     'fecha', true),
  ('EMBARAZO',                '¿Estás embarazada o tuviste un parto recientemente?',                                           'si_no', true),
  ('MEDICACION',              '¿Estás tomando antibióticos u otra medicación recetada?',                                        'si_no', true),
  ('ENFERMEDAD_TRANSMISIBLE', '¿Tenés o tuviste hepatitis B o C, Chagas o VIH?',                                                'si_no', false)
) AS p(codigo, texto, tipo, puede_cambiar)
JOIN "regla_elegibilidad" r ON r."codigo" = p.codigo;
