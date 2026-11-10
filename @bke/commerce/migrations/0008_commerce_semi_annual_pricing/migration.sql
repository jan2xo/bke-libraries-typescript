-- Separate enum expansion from dependent constraints for PostgreSQL safety.
ALTER TYPE "CommercePurchasePlanType" ADD VALUE IF NOT EXISTS 'SEMI_ANNUAL';
