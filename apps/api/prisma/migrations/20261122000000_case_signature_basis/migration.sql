-- File reference KR/YYYY/NNNN and the "Numer postepowania / podstawa" of a case.
ALTER TABLE "Case" ADD COLUMN "signature" TEXT, ADD COLUMN "basis" TEXT;

-- Cases that already exist get a reference too: running number within the (Warsaw) year of creation, oldest first.
UPDATE "Case" c
SET "signature" = 'KR/' || n.yr || '/' || lpad(n.rn::text, 4, '0')
FROM (
  SELECT id,
         to_char("createdAt" AT TIME ZONE 'Europe/Warsaw', 'YYYY') AS yr,
         row_number() OVER (PARTITION BY to_char("createdAt" AT TIME ZONE 'Europe/Warsaw', 'YYYY') ORDER BY "createdAt", id) AS rn
  FROM "Case"
) n
WHERE c.id = n.id;

ALTER TABLE "Case" ALTER COLUMN "signature" SET NOT NULL;
CREATE UNIQUE INDEX "Case_signature_key" ON "Case"("signature");
