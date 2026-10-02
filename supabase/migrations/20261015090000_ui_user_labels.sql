-- Personal HR bar tabs: each user may create, rename and delete sections of the HR module bar for themselves.
-- A section is a row "rh_sections.<key>" of sys_ui_user_order carrying its name (the sections shared with everyone
-- live in sys_ui_item_overrides, which already has label_fr).

alter table public.sys_ui_user_order
  add column if not exists label_fr text
    check (label_fr is null or char_length(btrim(label_fr)) between 1 and 80);

notify pgrst, 'reload schema';
