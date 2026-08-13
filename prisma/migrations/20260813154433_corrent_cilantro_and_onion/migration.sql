UPDATE "RawIngredient"
SET
  "name" = 'cilantro / sawtooth coriander',
  "canonicalUnit" = 'BUNCH'
WHERE "name" = 'culantro / sawtooth coriander';

UPDATE "RawIngredient"
SET "canonicalUnit" = 'KG'
WHERE "name" = 'onion';