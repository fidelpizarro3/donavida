-- CreateEnum
CREATE TYPE "cubierta_con" AS ENUM ('donantes', 'transferencia', 'ambas');

-- CreateEnum
CREATE TYPE "decision_turnos" AS ENUM ('mantener', 'reprogramar');

-- AlterTable
ALTER TABLE "convocatoria" ADD COLUMN     "decision_turnos" "decision_turnos",
ADD COLUMN     "mantener_abierta" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "necesidad" ADD COLUMN     "cubierta_con" "cubierta_con";

