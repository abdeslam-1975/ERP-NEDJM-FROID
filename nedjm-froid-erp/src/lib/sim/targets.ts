import type { HrBulletinSettings } from "@/lib/hr/bulletin-settings";
import type { SimulatorData } from "@/lib/hr/payroll-simulator-load";
import {
  mergeVarDefs,
  SimContext,
  type SimEnv,
  type SimOutput,
  type SimOverrides,
  type SimVarDef,
} from "@/lib/sim/core";
import {
  contractDocOutput,
  contractDocVariables,
  omOutput,
  omVariables,
  type ContractDocSimData,
  type OmSimData,
} from "@/lib/sim/documents";
import {
  stcOutput,
  stcVariables,
  titreOutput,
  titreVariables,
  type StcSimData,
  type TitreSimData,
} from "@/lib/sim/letters";
import { leaveVariables, soldeOutput, soldeVariables, type LeaveSimData } from "@/lib/sim/leave";
import { paieOutput, paieVariables } from "@/lib/sim/paie";
import { pointageOutput, pointageVariables } from "@/lib/sim/pointage";

/** Data of the element being simulated, loaded on the server. */
export type SimTargetData =
  | { target: "paie"; sim: SimulatorData; bulletin: HrBulletinSettings; template: string }
  | { target: "pointage"; sim: SimulatorData }
  | { target: "solde_conge"; leave: LeaveSimData }
  | ({ target: "titre_conge" } & TitreSimData)
  | ({ target: "stc" } & StcSimData)
  | { target: "ordre_mission"; om: OmSimData }
  | { target: "contrat_travail"; doc: ContractDocSimData };

function rawVariables(d: SimTargetData): SimVarDef[] {
  switch (d.target) {
    case "paie":
      return paieVariables(d.sim);
    case "pointage":
      return pointageVariables(d.sim);
    case "solde_conge":
      return soldeVariables(d.leave);
    case "titre_conge":
      return mergeVarDefs(titreVariables(d), leaveVariables(d.leave));
    case "stc":
      return mergeVarDefs(stcVariables(d), leaveVariables(d.leave), d.paie ? paieVariables(d.paie) : []);
    case "ordre_mission":
      return omVariables(d.om);
    case "contrat_travail":
      return contractDocVariables(d.doc);
  }
}

export function simRun(d: SimTargetData, ctx: SimContext, env: SimEnv): SimOutput {
  switch (d.target) {
    case "paie":
      return paieOutput(d.sim, d.bulletin, d.template, ctx, env);
    case "pointage":
      return pointageOutput(d.sim, ctx);
    case "solde_conge":
      return soldeOutput(d.leave, ctx);
    case "titre_conge":
      return titreOutput(d, ctx, env);
    case "stc":
      return stcOutput(d, ctx, env);
    case "ordre_mission":
      return omOutput(d.om, ctx, env);
    case "contrat_travail":
      return contractDocOutput(d.doc, ctx, env);
  }
}

export type SimRun = { output: SimOutput; ctx: SimContext };

export function runSimulation(
  d: SimTargetData,
  defs: ReadonlyMap<string, SimVarDef>,
  overrides: SimOverrides,
  env: SimEnv,
): SimRun {
  const ctx = new SimContext(defs, overrides);
  return { output: simRun(d, ctx, env), ctx };
}

/** Variable catalogue of the element; derived variables get the value computed from ERP data. */
export function simVariables(d: SimTargetData, env: SimEnv): SimVarDef[] {
  const defs = rawVariables(d);
  const map = new Map(defs.map((v) => [v.id, v]));
  const { ctx } = runSimulation(d, map, {}, env);
  return defs.map((v) => (v.derived && ctx.derivedValues.has(v.id) ? { ...v, base: ctx.derivedValues.get(v.id)! } : v));
}

/** Catalogue of elements shown side by side: a variable id read by several elements is one shared value. */
export function linkedVariables(list: readonly SimTargetData[], env: SimEnv): SimVarDef[] {
  return mergeVarDefs(...list.map((d) => simVariables(d, env)));
}
