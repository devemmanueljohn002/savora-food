-- Savora Food — rider presence sync: status <=> is_online invariant
-- Additive only. Historically new/seeded riders were inserted with
-- status='ACTIVE' while is_online defaulted FALSE, so the dispatch query
-- (status='ACTIVE' AND is_online=TRUE) never matched them and riders saw
-- zero jobs while the UI reported "Online". Restore the invariant and make
-- OFFLINE the default so presence requires an explicit Go online.

-- Heal existing rows: ACTIVE means online, anything else means offline.
UPDATE delivery_partners
SET is_online = (status = 'ACTIVE')
WHERE is_online IS DISTINCT FROM (status = 'ACTIVE');

-- New rider rows start offline until they explicitly go online.
ALTER TABLE delivery_partners ALTER COLUMN status SET DEFAULT 'OFFLINE';
