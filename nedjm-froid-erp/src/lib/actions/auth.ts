"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_SITE_COOKIE } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validations/auth";

const loginSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide"),
  password: z.string().min(8, "Mot de passe trop court"),
});

export type AuthActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function loginAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Identifiants invalides",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: "E-mail ou mot de passe incorrect.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("sys_users")
    .select("id, status, must_reset_password")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: `Profil ERP inaccessible: ${profileError.message}`,
    };
  }

  if (!profile) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error:
        "Compte Auth trouvé, mais aucun profil sys_users. Exécutez le bootstrap SUPER_ADMIN.",
    };
  }

  if (profile.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Compte désactivé ou suspendu. Contactez un administrateur.",
    };
  }

  // last_login_at only — must_reset_password is cleared AFTER real password change
  const { error: touchErr } = await supabase.rpc("sys_touch_login");
  if (touchErr) {
    // Non-fatal: login still succeeds; flag enforcement remains via select above
    console.error("sys_touch_login failed:", touchErr.message);
  }

  await supabase.rpc("sys_audit_write", {
    p_user_id: data.user.id,
    p_action: "LOGIN",
    p_table_name: "sys_users",
    p_target_id: data.user.id,
    p_old: null,
    p_new: {
      email: parsed.data.email.toLowerCase(),
      must_reset_password: profile.must_reset_password,
    },
    p_ip: null,
    p_user_agent: null,
    p_request_id: null,
  });

  if (profile.must_reset_password) {
    redirect("/changer-mot-de-passe");
  }

  const next = String(formData.get("next") || "/");
  redirect(next.startsWith("/") ? next : "/");
}

/**
 * Forced (and voluntary) password change.
 * Order: re-auth with current password → Auth updateUser → clear flag via RPC.
 */
export async function changePasswordAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = changePasswordSchema.safeParse({
    current_password: formData.get("current_password"),
    new_password: formData.get("new_password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, error: "Session expirée. Reconnectez-vous." };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current_password,
  });

  if (reauthError) {
    return { ok: false, error: "Mot de passe actuel incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.new_password,
  });

  if (updateError) {
    return {
      ok: false,
      error: updateError.message || "Échec de la mise à jour du mot de passe.",
    };
  }

  const { error: clearError } = await supabase.rpc(
    "sys_clear_must_reset_password",
  );

  if (clearError) {
    return {
      ok: false,
      error: `Mot de passe Auth mis à jour, mais drapeau ERP non levé: ${clearError.message}`,
    };
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_SITE_COOKIE);
  redirect("/login");
}

export async function setActiveSiteAction(
  siteId: string,
): Promise<AuthActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Session expirée." };
  }

  const idParsed = z.string().uuid().safeParse(siteId);
  if (!idParsed.success) {
    return { ok: false, error: "Site invalide." };
  }

  const { data: site, error } = await supabase
    .from("ref_sites")
    .select("id")
    .eq("id", idParsed.data)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !site) {
    return {
      ok: false,
      error: "Site hors périmètre ou inexistant.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SITE_COOKIE, site.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true };
}
