export type WorkspaceRole = {
  assignmentId: string;
  roleId: string;
  roleCode: string;
  roleLabelFr: string;
  hierarchyLevel: number;
  requireMfa: boolean;
  siteId: string | null;
  siteCode: string | null;
  siteNameFr: string | null;
  siteNameAr: string | null;
};

export type WorkspaceSite = {
  id: string;
  code: string;
  nameFr: string;
  nameAr: string | null;
  wilaya: string | null;
};

export type WorkspaceProfile = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  locale: string;
  isSuperAdmin: boolean;
  roles: WorkspaceRole[];
  /** Sites the user may access (global SUPER_ADMIN → all active sites). */
  accessibleSites: WorkspaceSite[];
  /** Active site for data scoping (cookie nf_active_site_id). */
  activeSite: WorkspaceSite | null;
  /** true when user has a global (site_id NULL) role grant. */
  hasGlobalScope: boolean;
};
