-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "aftercareNotes" TEXT,
ADD COLUMN     "depositRequired" DECIMAL(10,2),
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fullDescription" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "preparationNotes" TEXT,
ADD COLUMN     "professionalLabel" TEXT,
ADD COLUMN     "professionalRole" TEXT,
ADD COLUMN     "promoPrice" DECIMAL(10,2),
ADD COLUMN     "requiresFollowUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'activo',
ADD COLUMN     "suggestedFrequency" TEXT;
