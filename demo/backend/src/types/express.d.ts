import "express";

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by the authenticate middleware.
       *  - baseline: copied verbatim from the JWT claims (role/permissions included)
       *  - hardened: identity only (userId + jti); role is looked up from the DB
       *    at authorize time, never trusted from the token
       */
      auth?: {
        userId: string;
        jti?: string;
        // baseline only — present so we can SHOW that the app trusts it
        tokenRole?: string;
        tokenPermissions?: string[];
      };
    }
  }
}

export {};
