-- Registri additivi per verbali e sinistri stradali. Nessun dato esistente viene riscritto.
CREATE TYPE "RoadFineStatus" AS ENUM ('TO_REVIEW', 'TO_PAY', 'CONTESTED', 'PAID', 'CANCELLED', 'CLOSED');
CREATE TYPE "RoadFineResponsibility" AS ENUM ('TO_ASSESS', 'COMPANY', 'DRIVER');
CREATE TYPE "RoadAccidentStatus" AS ENUM ('REPORTED', 'DOCUMENTS_PENDING', 'CLAIM_OPEN', 'ASSESSMENT', 'REPAIR', 'SETTLEMENT_PENDING', 'CLOSED', 'CANCELLED');
CREATE TYPE "RoadAccidentResponsibility" AS ENUM ('TO_ASSESS', 'COMPANY', 'THIRD_PARTY', 'SHARED', 'NOT_APPLICABLE');
CREATE TYPE "RoadEventAttachmentKind" AS ENUM ('NOTICE', 'NOTIFICATION', 'PAYMENT_RECEIPT', 'APPEAL', 'CAI', 'PHOTO', 'POLICE_REPORT', 'ESTIMATE', 'APPRAISAL', 'INVOICE', 'INSURER_COMMUNICATION', 'OTHER');

CREATE TABLE "RoadFine" (
    "id" TEXT NOT NULL,
    "status" "RoadFineStatus" NOT NULL DEFAULT 'TO_REVIEW',
    "responsibility" "RoadFineResponsibility" NOT NULL DEFAULT 'TO_ASSESS',
    "noticeNumber" TEXT,
    "authority" TEXT NOT NULL,
    "violationDate" DATE NOT NULL,
    "violationTime" TEXT,
    "notificationDate" DATE,
    "location" TEXT NOT NULL,
    "violationCode" TEXT,
    "description" TEXT NOT NULL,
    "tractorId" TEXT,
    "trailerId" TEXT,
    "driverId" TEXT,
    "pointsDeducted" INTEGER,
    "reducedAmountCents" INTEGER,
    "standardAmountCents" INTEGER,
    "discountedPaymentDueDate" DATE,
    "paymentDueDate" DATE,
    "appealDueDate" DATE,
    "paidAmountCents" INTEGER,
    "paymentDate" DATE,
    "paymentReference" TEXT,
    "driverChargeCents" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadFine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadFine_amounts_check" CHECK (
      COALESCE("pointsDeducted", 0) >= 0 AND COALESCE("reducedAmountCents", 0) >= 0 AND
      COALESCE("standardAmountCents", 0) >= 0 AND COALESCE("paidAmountCents", 0) >= 0 AND
      COALESCE("driverChargeCents", 0) >= 0
    ),
    CONSTRAINT "RoadFine_payment_check" CHECK (
      "status" <> 'PAID' OR (COALESCE("paidAmountCents", 0) > 0 AND "paymentDate" IS NOT NULL)
    )
);

CREATE TABLE "RoadFineRevision" (
    "id" TEXT NOT NULL,
    "fineId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadFineRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoadAccident" (
    "id" TEXT NOT NULL,
    "status" "RoadAccidentStatus" NOT NULL DEFAULT 'REPORTED',
    "responsibility" "RoadAccidentResponsibility" NOT NULL DEFAULT 'TO_ASSESS',
    "accidentDate" DATE NOT NULL,
    "accidentTime" TEXT,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tractorId" TEXT,
    "trailerId" TEXT,
    "driverId" TEXT,
    "thirdPartyDetails" TEXT,
    "witnesses" TEXT,
    "authorityDetails" TEXT,
    "hasInjuries" BOOLEAN NOT NULL DEFAULT false,
    "cargoInvolved" BOOLEAN NOT NULL DEFAULT false,
    "vehicleImmobilized" BOOLEAN NOT NULL DEFAULT false,
    "towRequired" BOOLEAN NOT NULL DEFAULT false,
    "insurerName" TEXT,
    "policyNumber" TEXT,
    "claimNumber" TEXT,
    "reportedDate" DATE,
    "nextDeadline" DATE,
    "closedDate" DATE,
    "estimatedDamageCents" INTEGER,
    "deductibleCents" INTEGER,
    "directCostCents" INTEGER,
    "directCostDate" DATE,
    "reimbursementCents" INTEGER,
    "reimbursementDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadAccident_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadAccident_amounts_check" CHECK (
      COALESCE("estimatedDamageCents", 0) >= 0 AND COALESCE("deductibleCents", 0) >= 0 AND
      COALESCE("directCostCents", 0) >= 0 AND COALESCE("reimbursementCents", 0) >= 0
    ),
    CONSTRAINT "RoadAccident_direct_cost_check" CHECK (
      "directCostCents" IS NULL OR "directCostCents" = 0 OR "directCostDate" IS NOT NULL
    ),
    CONSTRAINT "RoadAccident_reimbursement_check" CHECK (
      "reimbursementCents" IS NULL OR "reimbursementCents" = 0 OR "reimbursementDate" IS NOT NULL
    )
);

CREATE TABLE "RoadAccidentRevision" (
    "id" TEXT NOT NULL,
    "accidentId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadAccidentRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoadEventAttachment" (
    "id" TEXT NOT NULL,
    "fineId" TEXT,
    "accidentId" TEXT,
    "kind" "RoadEventAttachmentKind" NOT NULL DEFAULT 'OTHER',
    "filePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadEventAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadEventAttachment_owner_check" CHECK (
      ("fineId" IS NOT NULL AND "accidentId" IS NULL) OR
      ("fineId" IS NULL AND "accidentId" IS NOT NULL)
    ),
    CONSTRAINT "RoadEventAttachment_size_check" CHECK ("fileSize" > 0)
);

ALTER TABLE "ExpenseDocument" ADD COLUMN "roadAccidentId" TEXT;

CREATE INDEX "RoadFine_status_paymentDueDate_idx" ON "RoadFine"("status", "paymentDueDate");
CREATE INDEX "RoadFine_violationDate_idx" ON "RoadFine"("violationDate");
CREATE INDEX "RoadFine_tractorId_idx" ON "RoadFine"("tractorId");
CREATE INDEX "RoadFine_trailerId_idx" ON "RoadFine"("trailerId");
CREATE INDEX "RoadFine_driverId_idx" ON "RoadFine"("driverId");
CREATE INDEX "RoadFineRevision_fineId_createdAt_idx" ON "RoadFineRevision"("fineId", "createdAt");
CREATE INDEX "RoadAccident_status_nextDeadline_idx" ON "RoadAccident"("status", "nextDeadline");
CREATE INDEX "RoadAccident_accidentDate_idx" ON "RoadAccident"("accidentDate");
CREATE INDEX "RoadAccident_tractorId_idx" ON "RoadAccident"("tractorId");
CREATE INDEX "RoadAccident_trailerId_idx" ON "RoadAccident"("trailerId");
CREATE INDEX "RoadAccident_driverId_idx" ON "RoadAccident"("driverId");
CREATE INDEX "RoadAccident_claimNumber_idx" ON "RoadAccident"("claimNumber");
CREATE INDEX "RoadAccidentRevision_accidentId_createdAt_idx" ON "RoadAccidentRevision"("accidentId", "createdAt");
CREATE INDEX "RoadEventAttachment_fineId_createdAt_idx" ON "RoadEventAttachment"("fineId", "createdAt");
CREATE INDEX "RoadEventAttachment_accidentId_createdAt_idx" ON "RoadEventAttachment"("accidentId", "createdAt");
CREATE INDEX "ExpenseDocument_roadAccidentId_idx" ON "ExpenseDocument"("roadAccidentId");

ALTER TABLE "RoadFine" ADD CONSTRAINT "RoadFine_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoadFine" ADD CONSTRAINT "RoadFine_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoadFine" ADD CONSTRAINT "RoadFine_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoadFineRevision" ADD CONSTRAINT "RoadFineRevision_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "RoadFine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadAccident" ADD CONSTRAINT "RoadAccident_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoadAccident" ADD CONSTRAINT "RoadAccident_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoadAccident" ADD CONSTRAINT "RoadAccident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoadAccidentRevision" ADD CONSTRAINT "RoadAccidentRevision_accidentId_fkey" FOREIGN KEY ("accidentId") REFERENCES "RoadAccident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadEventAttachment" ADD CONSTRAINT "RoadEventAttachment_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "RoadFine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadEventAttachment" ADD CONSTRAINT "RoadEventAttachment_accidentId_fkey" FOREIGN KEY ("accidentId") REFERENCES "RoadAccident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_roadAccidentId_fkey" FOREIGN KEY ("roadAccidentId") REFERENCES "RoadAccident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
