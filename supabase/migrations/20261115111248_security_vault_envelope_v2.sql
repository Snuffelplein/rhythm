alter table public.encrypted_vaults drop constraint encrypted_envelope_only;
alter table public.encrypted_vaults add constraint encrypted_envelope_only check (
  jsonb_typeof(envelope) = 'object'
  and envelope ?& array['version','salt','iv','ciphertext']
  and envelope - 'version' - 'salt' - 'iv' - 'ciphertext' = '{}'::jsonb
  and envelope -> 'version' in ('1'::jsonb, '2'::jsonb)
  and jsonb_typeof(envelope -> 'salt') = 'string'
  and (envelope ->> 'salt') ~ '^[A-Za-z0-9+/]{22}==$'
  and jsonb_typeof(envelope -> 'iv') = 'string'
  and (envelope ->> 'iv') ~ '^[A-Za-z0-9+/]{16}$'
  and jsonb_typeof(envelope -> 'ciphertext') = 'string'
  and length(envelope ->> 'ciphertext') between 24 and 2000000
  and length(envelope ->> 'ciphertext') % 4 = 0
  and (envelope ->> 'ciphertext') ~ '^[A-Za-z0-9+/]+={0,2}$'
);
