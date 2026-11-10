-- Autoriser des bons un peu plus lourds après compression JPEG (~3–4 Mo data URL).
alter table public.caisse_operations
  drop constraint if exists caisse_operations_photo_size;

alter table public.caisse_operations
  add constraint caisse_operations_photo_size
  check (photo_data is null or char_length(photo_data) <= 4000000);
