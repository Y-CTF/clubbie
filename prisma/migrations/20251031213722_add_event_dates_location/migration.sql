/*
  Warnings:

  - Added the required column `start` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "end" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "start" TIMESTAMP(3) NOT NULL;
