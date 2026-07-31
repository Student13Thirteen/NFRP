-- FAI/Autostrade supports signed amounts. Existing PD/PU rows are coherent
-- negative adjustments: keep the negative cost and restore signed VAT.
WITH coherent_adjustments AS (
  SELECT
    entry."id",
    NULLIF(
      string_agg(reason.value, '; ' ORDER BY reason.ordinality)
        FILTER (WHERE reason.value <> 'Importo lordo non positivo'),
      ''
    ) AS cleaned_review_reasons
  FROM "TollEntry" AS entry
  LEFT JOIN LATERAL unnest(
    string_to_array(COALESCE(entry."reviewReasons", ''), '; ')
  ) WITH ORDINALITY AS reason(value, ordinality) ON true
  WHERE entry."grossAmountCents" < 0
    AND entry."netAmountCents" < 0
    AND (
      (
        entry."grossAmountCents" = entry."netAmountCents"
        AND COALESCE(entry."vatRatePercent", 0) = 0
      )
      OR (
        entry."vatRatePercent" BETWEEN 0 AND 100
        AND abs(
          abs(entry."grossAmountCents")
          - round(abs(entry."netAmountCents") * (1 + entry."vatRatePercent"::numeric / 100))
        ) <= 1
      )
    )
  GROUP BY entry."id"
)
UPDATE "TollEntry" AS entry
SET
  "vatAmountCents" = entry."grossAmountCents" - entry."netAmountCents",
  "reviewReasons" = coherent.cleaned_review_reasons,
  "updatedAt" = CURRENT_TIMESTAMP
FROM coherent_adjustments AS coherent
WHERE entry."id" = coherent."id";

UPDATE "TollImportBatch" AS batch
SET "totalVatCents" = totals.total_vat_cents
FROM (
  SELECT "importBatchId", COALESCE(sum("vatAmountCents"), 0)::integer AS total_vat_cents
  FROM "TollEntry"
  GROUP BY "importBatchId"
) AS totals
WHERE batch."id" = totals."importBatchId";
