-- CreateEnum
CREATE TYPE "rol" AS ENUM ('donante', 'institucion', 'admin');

-- CreateEnum
CREATE TYPE "grupo_sanguineo" AS ENUM ('A', 'B', 'AB', 'O');

-- CreateEnum
CREATE TYPE "factor_rh" AS ENUM ('positivo', 'negativo');

-- CreateEnum
CREATE TYPE "componente" AS ENUM ('sangre_entera', 'globulos_rojos', 'plaquetas');

-- CreateEnum
CREATE TYPE "sexo" AS ENUM ('femenino', 'masculino', 'x');

-- CreateEnum
CREATE TYPE "sexo_aplica" AS ENUM ('todos', 'femenino', 'masculino');

-- CreateEnum
CREATE TYPE "tipo_institucion" AS ENUM ('hospital', 'banco_de_sangre');

-- CreateEnum
CREATE TYPE "estado_institucion" AS ENUM ('pendiente', 'aprobada', 'rechazada', 'baja');

-- CreateEnum
CREATE TYPE "tipo_pregunta" AS ENUM ('si_no', 'numero', 'fecha', 'texto');

-- CreateEnum
CREATE TYPE "resultado_cuestionario" AS ENUM ('apto', 'no_apto');

-- CreateEnum
CREATE TYPE "origen_cuestionario" AS ENUM ('formulario', 'asistente');

-- CreateEnum
CREATE TYPE "tipo_regla" AS ENUM ('edad', 'peso', 'intervalo_donacion', 'diferimiento');

-- CreateEnum
CREATE TYPE "origen_diferimiento" AS ENUM ('cuestionario', 'donacion', 'institucion');

-- CreateEnum
CREATE TYPE "tipo_consulta" AS ENUM ('cuestionario', 'necesidad', 'requisitos');

-- CreateEnum
CREATE TYPE "urgencia" AS ENUM ('urgente', 'normal');

-- CreateEnum
CREATE TYPE "estado_necesidad" AS ENUM ('abierta', 'cubierta', 'cerrada_manual', 'vencida');

-- CreateEnum
CREATE TYPE "estado_convocatoria" AS ENUM ('propuesta', 'enviada', 'cerrada');

-- CreateEnum
CREATE TYPE "canal_alerta" AS ENUM ('push', 'email', 'whatsapp');

-- CreateEnum
CREATE TYPE "estado_alerta" AS ENUM ('pendiente', 'enviada', 'aceptada', 'rechazada', 'cancelada');

-- CreateEnum
CREATE TYPE "estado_turno" AS ENUM ('reservado', 'cancelado', 'asistio', 'ausente');

-- CreateEnum
CREATE TYPE "resultado_donacion" AS ENUM ('realizada', 'rechazada');

-- CreateEnum
CREATE TYPE "estado_unidad" AS ENUM ('disponible', 'reservada', 'usada', 'vencida', 'descartada');

-- CreateEnum
CREATE TYPE "tipo_movimiento" AS ENUM ('ingreso', 'reserva', 'liberacion', 'uso', 'transferencia', 'vencimiento', 'descarte');

-- CreateEnum
CREATE TYPE "estado_transferencia" AS ENUM ('pendiente', 'aceptada', 'rechazada', 'expirada', 'cancelada', 'recibida');

-- CreateTable
CREATE TABLE "usuario" (
    "id_usuario" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido" VARCHAR(100) NOT NULL,
    "rol" "rol" NOT NULL,
    "email_verificado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "donante" (
    "id_donante" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,
    "documento" VARCHAR(20) NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "sexo" "sexo" NOT NULL,
    "grupo_sanguineo" "grupo_sanguineo",
    "factor_rh" "factor_rh",
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "contacto_hora_desde" TIME(0),
    "contacto_hora_hasta" TIME(0),
    "aviso_push" BOOLEAN NOT NULL DEFAULT true,
    "aviso_email" BOOLEAN NOT NULL DEFAULT true,
    "aviso_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "tope_alertas_mes" INTEGER NOT NULL DEFAULT 4,
    "alertas_pausadas_hasta" DATE,
    "apto_desde" DATE,
    "alertas_mes_actual" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "donante_pkey" PRIMARY KEY ("id_donante")
);

-- CreateTable
CREATE TABLE "institucion" (
    "id_institucion" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "direccion" VARCHAR(255) NOT NULL,
    "documentacion_url" VARCHAR(500),
    "tipo" "tipo_institucion" NOT NULL,
    "estado" "estado_institucion" NOT NULL DEFAULT 'pendiente',
    "motivo_rechazo" VARCHAR(500),
    "id_usuario_aprobador" UUID,
    "latitud" DECIMAL(9,6) NOT NULL,
    "longitud" DECIMAL(9,6) NOT NULL,
    "intervalo_donacion_dias" INTEGER NOT NULL DEFAULT 56,

    CONSTRAINT "institucion_pkey" PRIMARY KEY ("id_institucion")
);

-- CreateTable
CREATE TABLE "usuario_institucion" (
    "id_usuario" UUID NOT NULL,
    "id_institucion" UUID NOT NULL,
    "cargo" VARCHAR(100),

    CONSTRAINT "usuario_institucion_pkey" PRIMARY KEY ("id_usuario","id_institucion")
);

-- CreateTable
CREATE TABLE "stock_minimo" (
    "id_institucion" UUID NOT NULL,
    "grupo_sanguineo" "grupo_sanguineo" NOT NULL,
    "factor_rh" "factor_rh" NOT NULL,
    "componente" "componente" NOT NULL,
    "unidades_minimas" INTEGER NOT NULL,

    CONSTRAINT "stock_minimo_pkey" PRIMARY KEY ("id_institucion","grupo_sanguineo","factor_rh","componente")
);

-- CreateTable
CREATE TABLE "suscripcion_push" (
    "id_suscripcion_push" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,
    "endpoint" VARCHAR(500) NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripcion_push_pkey" PRIMARY KEY ("id_suscripcion_push")
);

-- CreateTable
CREATE TABLE "pregunta" (
    "id_pregunta" UUID NOT NULL,
    "texto" VARCHAR(500) NOT NULL,
    "tipo" "tipo_pregunta" NOT NULL,
    "version_formulario" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pregunta_pkey" PRIMARY KEY ("id_pregunta")
);

-- CreateTable
CREATE TABLE "cuestionario_aptitud" (
    "id_cuestionario_aptitud" UUID NOT NULL,
    "id_donante" UUID NOT NULL,
    "version_formulario" INTEGER NOT NULL,
    "resultado" "resultado_cuestionario",
    "origen" "origen_cuestionario" NOT NULL,
    "completado_en" TIMESTAMP(3),

    CONSTRAINT "cuestionario_aptitud_pkey" PRIMARY KEY ("id_cuestionario_aptitud")
);

-- CreateTable
CREATE TABLE "respuesta_cuestionario" (
    "id_respuesta_cuestionario" UUID NOT NULL,
    "id_cuestionario_aptitud" UUID NOT NULL,
    "id_pregunta" UUID NOT NULL,
    "valor" VARCHAR(500) NOT NULL,

    CONSTRAINT "respuesta_cuestionario_pkey" PRIMARY KEY ("id_respuesta_cuestionario")
);

-- CreateTable
CREATE TABLE "regla_elegibilidad" (
    "id_regla_elegibilidad" UUID NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "tipo" "tipo_regla" NOT NULL,
    "edad_min" INTEGER,
    "edad_max" INTEGER,
    "peso_min" DECIMAL(5,2),
    "sexo_aplica" "sexo_aplica" NOT NULL DEFAULT 'todos',
    "dias_diferimiento" INTEGER,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE,
    "fuente_normativa" VARCHAR(255) NOT NULL,

    CONSTRAINT "regla_elegibilidad_pkey" PRIMARY KEY ("id_regla_elegibilidad")
);

-- CreateTable
CREATE TABLE "diferimiento" (
    "id_diferimiento" UUID NOT NULL,
    "id_donante" UUID NOT NULL,
    "id_regla_elegibilidad" UUID,
    "origen" "origen_diferimiento" NOT NULL,
    "motivo" VARCHAR(500) NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,

    CONSTRAINT "diferimiento_pkey" PRIMARY KEY ("id_diferimiento")
);

-- CreateTable
CREATE TABLE "documento_normativa" (
    "id_documento_normativa" UUID NOT NULL,
    "titulo" VARCHAR(255) NOT NULL,
    "fuente" VARCHAR(255) NOT NULL,
    "url" VARCHAR(500),
    "texto" TEXT NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE,

    CONSTRAINT "documento_normativa_pkey" PRIMARY KEY ("id_documento_normativa")
);

-- CreateTable
CREATE TABLE "consulta_asistente" (
    "id_consulta_asistente" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,
    "tipo" "tipo_consulta" NOT NULL,
    "texto_ingresado" TEXT NOT NULL,
    "interpretacion" JSONB,
    "respuesta" TEXT,
    "id_documento_normativa" UUID,
    "confirmado_por_usuario" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consulta_asistente_pkey" PRIMARY KEY ("id_consulta_asistente")
);

-- CreateTable
CREATE TABLE "necesidad" (
    "id_necesidad" UUID NOT NULL,
    "id_institucion" UUID NOT NULL,
    "grupo_sanguineo" "grupo_sanguineo" NOT NULL,
    "factor_rh" "factor_rh" NOT NULL,
    "componente" "componente" NOT NULL,
    "unidades_solicitadas" INTEGER NOT NULL,
    "unidades_cubiertas" INTEGER NOT NULL DEFAULT 0,
    "urgencia" "urgencia" NOT NULL,
    "fecha_limite" DATE NOT NULL,
    "estado" "estado_necesidad" NOT NULL DEFAULT 'abierta',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMP(3),

    CONSTRAINT "necesidad_pkey" PRIMARY KEY ("id_necesidad")
);

-- CreateTable
CREATE TABLE "convocatoria" (
    "id_convocatoria" UUID NOT NULL,
    "id_necesidad" UUID NOT NULL,
    "radio_km" DECIMAL(7,2) NOT NULL,
    "cupo_disponible" INTEGER NOT NULL,
    "estado" "estado_convocatoria" NOT NULL DEFAULT 'propuesta',
    "id_usuario_confirmador" UUID,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convocatoria_pkey" PRIMARY KEY ("id_convocatoria")
);

-- CreateTable
CREATE TABLE "alerta" (
    "id_alerta" UUID NOT NULL,
    "id_convocatoria" UUID NOT NULL,
    "id_donante" UUID NOT NULL,
    "canal" "canal_alerta" NOT NULL,
    "estado" "estado_alerta" NOT NULL DEFAULT 'pendiente',
    "motivo" VARCHAR(500) NOT NULL,
    "distancia_km" DECIMAL(7,2) NOT NULL,
    "enviada_en" TIMESTAMP(3),
    "respondida_en" TIMESTAMP(3),

    CONSTRAINT "alerta_pkey" PRIMARY KEY ("id_alerta")
);

-- CreateTable
CREATE TABLE "franja_horaria" (
    "id_franja_horaria" UUID NOT NULL,
    "id_institucion" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "hora_inicio" TIME(0) NOT NULL,
    "hora_fin" TIME(0) NOT NULL,
    "cupo_total" INTEGER NOT NULL,
    "cupo_ocupado" INTEGER NOT NULL DEFAULT 0,
    "cerrada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "franja_horaria_pkey" PRIMARY KEY ("id_franja_horaria")
);

-- CreateTable
CREATE TABLE "turno" (
    "id_turno" UUID NOT NULL,
    "id_franja_horaria" UUID NOT NULL,
    "id_donante" UUID NOT NULL,
    "id_alerta" UUID NOT NULL,
    "estado" "estado_turno" NOT NULL DEFAULT 'reservado',
    "codigo_qr" VARCHAR(100) NOT NULL,
    "recordatorio_enviado_en" TIMESTAMP(3),

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id_turno")
);

-- CreateTable
CREATE TABLE "donacion" (
    "id_donacion" UUID NOT NULL,
    "id_turno" UUID NOT NULL,
    "id_donante" UUID NOT NULL,
    "id_institucion" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "resultado" "resultado_donacion" NOT NULL,
    "grupo_confirmado" "grupo_sanguineo",
    "factor_rh_confirmado" "factor_rh",

    CONSTRAINT "donacion_pkey" PRIMARY KEY ("id_donacion")
);

-- CreateTable
CREATE TABLE "unidad_sangre" (
    "id_unidad_sangre" UUID NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "id_institucion" UUID NOT NULL,
    "id_donacion" UUID,
    "grupo_sanguineo" "grupo_sanguineo" NOT NULL,
    "factor_rh" "factor_rh" NOT NULL,
    "componente" "componente" NOT NULL,
    "fecha_extraccion" DATE NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "estado" "estado_unidad" NOT NULL DEFAULT 'disponible',

    CONSTRAINT "unidad_sangre_pkey" PRIMARY KEY ("id_unidad_sangre")
);

-- CreateTable
CREATE TABLE "movimiento_unidad" (
    "id_movimiento_unidad" UUID NOT NULL,
    "id_unidad_sangre" UUID NOT NULL,
    "tipo" "tipo_movimiento" NOT NULL,
    "estado_anterior" "estado_unidad",
    "estado_nuevo" "estado_unidad" NOT NULL,
    "id_institucion_origen" UUID,
    "id_institucion_destino" UUID,
    "id_usuario" UUID,
    "ocurrido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_unidad_pkey" PRIMARY KEY ("id_movimiento_unidad")
);

-- CreateTable
CREATE TABLE "transferencia" (
    "id_transferencia" UUID NOT NULL,
    "id_institucion_solicitante" UUID NOT NULL,
    "id_institucion_proveedora" UUID NOT NULL,
    "id_necesidad" UUID,
    "estado" "estado_transferencia" NOT NULL DEFAULT 'pendiente',
    "motivo_rechazo" VARCHAR(500),
    "plazo_respuesta" TIMESTAMP(3) NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recibida_en" TIMESTAMP(3),

    CONSTRAINT "transferencia_pkey" PRIMARY KEY ("id_transferencia")
);

-- CreateTable
CREATE TABLE "transferencia_item" (
    "id_transferencia_item" UUID NOT NULL,
    "id_transferencia" UUID NOT NULL,
    "id_unidad_sangre" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "transferencia_item_pkey" PRIMARY KEY ("id_transferencia_item")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "donante_id_usuario_key" ON "donante"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "donante_documento_key" ON "donante"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_cuestionario_id_cuestionario_aptitud_id_pregunta_key" ON "respuesta_cuestionario"("id_cuestionario_aptitud", "id_pregunta");

-- CreateIndex
CREATE UNIQUE INDEX "regla_elegibilidad_codigo_key" ON "regla_elegibilidad"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_id_convocatoria_id_donante_key" ON "alerta"("id_convocatoria", "id_donante");

-- CreateIndex
CREATE UNIQUE INDEX "turno_id_alerta_key" ON "turno"("id_alerta");

-- CreateIndex
CREATE UNIQUE INDEX "turno_codigo_qr_key" ON "turno"("codigo_qr");

-- CreateIndex
CREATE UNIQUE INDEX "donacion_id_turno_key" ON "donacion"("id_turno");

-- CreateIndex
CREATE UNIQUE INDEX "unidad_sangre_codigo_key" ON "unidad_sangre"("codigo");

-- AddForeignKey
ALTER TABLE "donante" ADD CONSTRAINT "donante_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institucion" ADD CONSTRAINT "institucion_id_usuario_aprobador_fkey" FOREIGN KEY ("id_usuario_aprobador") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_institucion" ADD CONSTRAINT "usuario_institucion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_institucion" ADD CONSTRAINT "usuario_institucion_id_institucion_fkey" FOREIGN KEY ("id_institucion") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_minimo" ADD CONSTRAINT "stock_minimo_id_institucion_fkey" FOREIGN KEY ("id_institucion") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuestionario_aptitud" ADD CONSTRAINT "cuestionario_aptitud_id_donante_fkey" FOREIGN KEY ("id_donante") REFERENCES "donante"("id_donante") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_cuestionario" ADD CONSTRAINT "respuesta_cuestionario_id_cuestionario_aptitud_fkey" FOREIGN KEY ("id_cuestionario_aptitud") REFERENCES "cuestionario_aptitud"("id_cuestionario_aptitud") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_cuestionario" ADD CONSTRAINT "respuesta_cuestionario_id_pregunta_fkey" FOREIGN KEY ("id_pregunta") REFERENCES "pregunta"("id_pregunta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diferimiento" ADD CONSTRAINT "diferimiento_id_donante_fkey" FOREIGN KEY ("id_donante") REFERENCES "donante"("id_donante") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diferimiento" ADD CONSTRAINT "diferimiento_id_regla_elegibilidad_fkey" FOREIGN KEY ("id_regla_elegibilidad") REFERENCES "regla_elegibilidad"("id_regla_elegibilidad") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_asistente" ADD CONSTRAINT "consulta_asistente_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_asistente" ADD CONSTRAINT "consulta_asistente_id_documento_normativa_fkey" FOREIGN KEY ("id_documento_normativa") REFERENCES "documento_normativa"("id_documento_normativa") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "necesidad" ADD CONSTRAINT "necesidad_id_institucion_fkey" FOREIGN KEY ("id_institucion") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria" ADD CONSTRAINT "convocatoria_id_necesidad_fkey" FOREIGN KEY ("id_necesidad") REFERENCES "necesidad"("id_necesidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria" ADD CONSTRAINT "convocatoria_id_usuario_confirmador_fkey" FOREIGN KEY ("id_usuario_confirmador") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_id_convocatoria_fkey" FOREIGN KEY ("id_convocatoria") REFERENCES "convocatoria"("id_convocatoria") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_id_donante_fkey" FOREIGN KEY ("id_donante") REFERENCES "donante"("id_donante") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franja_horaria" ADD CONSTRAINT "franja_horaria_id_institucion_fkey" FOREIGN KEY ("id_institucion") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_id_franja_horaria_fkey" FOREIGN KEY ("id_franja_horaria") REFERENCES "franja_horaria"("id_franja_horaria") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_id_donante_fkey" FOREIGN KEY ("id_donante") REFERENCES "donante"("id_donante") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_id_alerta_fkey" FOREIGN KEY ("id_alerta") REFERENCES "alerta"("id_alerta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donacion" ADD CONSTRAINT "donacion_id_turno_fkey" FOREIGN KEY ("id_turno") REFERENCES "turno"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donacion" ADD CONSTRAINT "donacion_id_donante_fkey" FOREIGN KEY ("id_donante") REFERENCES "donante"("id_donante") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donacion" ADD CONSTRAINT "donacion_id_institucion_fkey" FOREIGN KEY ("id_institucion") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad_sangre" ADD CONSTRAINT "unidad_sangre_id_institucion_fkey" FOREIGN KEY ("id_institucion") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad_sangre" ADD CONSTRAINT "unidad_sangre_id_donacion_fkey" FOREIGN KEY ("id_donacion") REFERENCES "donacion"("id_donacion") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_unidad" ADD CONSTRAINT "movimiento_unidad_id_unidad_sangre_fkey" FOREIGN KEY ("id_unidad_sangre") REFERENCES "unidad_sangre"("id_unidad_sangre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_unidad" ADD CONSTRAINT "movimiento_unidad_id_institucion_origen_fkey" FOREIGN KEY ("id_institucion_origen") REFERENCES "institucion"("id_institucion") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_unidad" ADD CONSTRAINT "movimiento_unidad_id_institucion_destino_fkey" FOREIGN KEY ("id_institucion_destino") REFERENCES "institucion"("id_institucion") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_unidad" ADD CONSTRAINT "movimiento_unidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_id_institucion_solicitante_fkey" FOREIGN KEY ("id_institucion_solicitante") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_id_institucion_proveedora_fkey" FOREIGN KEY ("id_institucion_proveedora") REFERENCES "institucion"("id_institucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_id_necesidad_fkey" FOREIGN KEY ("id_necesidad") REFERENCES "necesidad"("id_necesidad") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_item" ADD CONSTRAINT "transferencia_item_id_transferencia_fkey" FOREIGN KEY ("id_transferencia") REFERENCES "transferencia"("id_transferencia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_item" ADD CONSTRAINT "transferencia_item_id_unidad_sangre_fkey" FOREIGN KEY ("id_unidad_sangre") REFERENCES "unidad_sangre"("id_unidad_sangre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Agregado a mano: Prisma no puede expresar esto en schema.prisma ─────────

-- franja_horaria: el cupo ocupado nunca puede ser negativo ni superar el cupo total
ALTER TABLE "franja_horaria" ADD CONSTRAINT "franja_horaria_cupo_ocupado_check" CHECK ("cupo_ocupado" >= 0 AND "cupo_ocupado" <= "cupo_total");

-- CORRECCIÓN 4: un donante no puede tener dos turnos vigentes en la misma franja (los cancelados no cuentan)
CREATE UNIQUE INDEX "turno_id_franja_horaria_id_donante_vigente_key" ON "turno"("id_franja_horaria", "id_donante") WHERE "estado" <> 'cancelado';

-- CORRECCIÓN 3: una unidad no puede estar en dos transferencias en curso a la vez
CREATE UNIQUE INDEX "transferencia_item_id_unidad_sangre_activo_key" ON "transferencia_item"("id_unidad_sangre") WHERE "activo";
