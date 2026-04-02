-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "cabin" TEXT;

-- CreateTable
CREATE TABLE "AppointmentConflictOverride" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "conflictTypes" TEXT[],
    "conflictingAppointmentIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentConflictOverride_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AppointmentConflictOverride" ADD CONSTRAINT "AppointmentConflictOverride_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentConflictOverride" ADD CONSTRAINT "AppointmentConflictOverride_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
