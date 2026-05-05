// Shared Hono environment shape.
//
// `Bindings` mirrors the Cloudflare Worker bindings (env). `Variables`
// is the per-request typed context map middleware writes into.

import type { Session } from "../auth";
import type { Env, ShareRow } from "../types";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    session: Session;
    share: ShareRow;
  };
}
