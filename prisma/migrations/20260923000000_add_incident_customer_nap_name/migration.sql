-- Retain the physical NAP/ODB reported by Smart OLT for each customer in an
-- incident. The column is nullable so existing historical incidents remain
-- readable and are enriched on their next impact refresh.
ALTER TABLE "incident_customers" ADD COLUMN "napName" VARCHAR(255);
