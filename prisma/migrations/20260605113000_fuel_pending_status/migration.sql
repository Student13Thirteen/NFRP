-- Add a PENDING state used for fuel rows imported from a FuelCo PDF that still
-- need human validation before they enter the cost center and km/euro calculations.
ALTER TYPE "FuelEntryStatus" ADD VALUE IF NOT EXISTS 'PENDING';
