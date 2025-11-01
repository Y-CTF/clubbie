/*
  Warnings:

  - Added the required column `kind` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('COMPETITION', 'SOCIAL', 'MEETING', 'WORKSHOP', 'CONFERENCE', 'OTHER');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "kind" "EventKind" NOT NULL;
