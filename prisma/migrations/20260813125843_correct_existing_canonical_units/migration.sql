-- Correct ingredient names and canonical units from the existing vegetable inventory.

UPDATE "RawIngredient"
SET
  "name" = 'chilote',
  "canonicalUnit" = 'EACH'
WHERE "name" = 'chayote';

UPDATE "RawIngredient"
SET
  "name" = 'dill',
  "canonicalUnit" = 'BUNCH'
WHERE "name" = 'sweet pepper / bell pepper';

UPDATE "RawIngredient"
SET "canonicalUnit" = 'BUNCH'
WHERE "name" IN (
  'basil',
  'cilantro / sawtooth coriander',
  'mint / spearmint'
);

UPDATE "RawIngredient"
SET "canonicalUnit" = 'HEAD'
WHERE "name" = 'lettuce';